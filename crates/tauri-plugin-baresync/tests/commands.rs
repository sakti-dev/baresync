use baresync_core::config::SyncEngineConfig;
use baresync_core::drizzle_proxy::{SqlQuery, SqlStatement};
use baresync_core::engine::SyncContractTables;
use baresync_core::migrations::EmbeddedMigration;
use serde_json::Value;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri_plugin_baresync::commands::{
    get_db_info_with_state, get_migration_status_with_state, get_sync_local_state_with_state,
    purge_synced_outbox_with_state, run_garbage_collection_with_state, run_migrations_with_state,
    run_sql_batch_with_state, run_sql_with_state, PluginState,
};

struct TestCommandState {
    state: PluginState,
}

impl TestCommandState {
    async fn new() -> Self {
        let db_path = temp_db_path();
        let options = SqliteConnectOptions::from_str(&format!("sqlite:{}", db_path.display()))
            .unwrap()
            .create_if_missing(true)
            .pragma("foreign_keys", "ON");
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .unwrap();

        let state = PluginState {
            pool: Arc::new(pool),
            sync_config: SyncEngineConfig {
                api_url: "http://127.0.0.1:9/sync".to_string(),
                scope_id: "scope-1".to_string(),
                ..Default::default()
            },
            contract_tables: SyncContractTables {
                upsert_order: vec!["items".to_string()],
                delete_order: vec!["items".to_string()],
                local_only_columns: vec![],
            },
            db_path,
            embedded_migrations: Arc::new(vec![EmbeddedMigration {
                name: "0001_test_items",
                sql: "
                    CREATE TABLE IF NOT EXISTS items (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        deleted_at TEXT,
                        is_synced INTEGER NOT NULL DEFAULT 0
                    );
                    --> statement-breakpoint
                    CREATE TABLE IF NOT EXISTS sync_outbox (
                        id TEXT PRIMARY KEY,
                        table_name TEXT NOT NULL,
                        row_id TEXT NOT NULL,
                        operation TEXT NOT NULL,
                        payload TEXT,
                        scope_id TEXT NOT NULL,
                        changed_at TEXT NOT NULL,
                        synced_at TEXT
                    );
                    --> statement-breakpoint
                    CREATE TABLE IF NOT EXISTS sync_cursors (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        scope_id TEXT NOT NULL,
                        last_cursor TEXT NOT NULL DEFAULT '',
                        updated_at TEXT NOT NULL
                    );
                    --> statement-breakpoint
                    CREATE TABLE IF NOT EXISTS sync_client_identity (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        client_id TEXT NOT NULL UNIQUE,
                        created_at TEXT NOT NULL
                    );
                ",
            }]),
        };

        Self { state }
    }
}

fn temp_db_path() -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!(
        "baresync-command-test-{}-{}.db",
        std::process::id(),
        nanos
    ))
}

#[tokio::test]
async fn db_proxy_commands_use_shared_test_state() {
    let harness = TestCommandState::new().await;

    let create_rows = run_sql_with_state(
        &harness.state,
        SqlQuery {
            sql: "CREATE TABLE db_proxy_items (id TEXT PRIMARY KEY, name TEXT NOT NULL)"
                .to_string(),
            params: vec![],
            method: "run".to_string(),
        },
    )
    .await
    .unwrap();
    assert!(create_rows.is_empty());

    let batch = run_sql_batch_with_state(
        &harness.state,
        vec![
            SqlStatement {
                sql: "INSERT INTO db_proxy_items (id, name) VALUES (?1, ?2)".to_string(),
                params: vec![
                    Value::String("item-1".to_string()),
                    Value::String("Coffee".to_string()),
                ],
            },
            SqlStatement {
                sql: "INSERT INTO db_proxy_items (id, name) VALUES (?1, ?2)".to_string(),
                params: vec![
                    Value::String("item-2".to_string()),
                    Value::String("Tea".to_string()),
                ],
            },
        ],
    )
    .await
    .unwrap();
    assert_eq!(batch.rows_affected, 2);

    let rows = run_sql_with_state(
        &harness.state,
        SqlQuery {
            sql: "SELECT id, name FROM db_proxy_items ORDER BY id".to_string(),
            params: vec![],
            method: "all".to_string(),
        },
    )
    .await
    .unwrap();

    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].columns, vec!["id", "name"]);
    assert_eq!(
        rows[0].values,
        vec![
            Value::String("item-1".to_string()),
            Value::String("Coffee".to_string())
        ]
    );
    assert_eq!(
        rows[1].values,
        vec![
            Value::String("item-2".to_string()),
            Value::String("Tea".to_string())
        ]
    );

    let info = get_db_info_with_state(&harness.state).await.unwrap();
    assert_eq!(info.db_path, harness.state.db_path.display().to_string());
    assert!(info.size_bytes > 0);
}

#[tokio::test]
async fn migration_commands_apply_embedded_migrations_and_report_status() {
    let harness = TestCommandState::new().await;

    run_migrations_with_state(&harness.state).await.unwrap();

    let status = get_migration_status_with_state(&harness.state)
        .await
        .unwrap();
    assert_eq!(status.len(), 1);
    assert_eq!(status[0].hash, "0001_test_items");

    let item_table_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'items'",
    )
    .fetch_one(&*harness.state.pool)
    .await
    .unwrap();
    assert_eq!(item_table_count, 1);
}

#[tokio::test]
async fn local_state_command_reports_seeded_outbox_and_cursor() {
    let harness = TestCommandState::new().await;
    run_migrations_with_state(&harness.state).await.unwrap();

    sqlx::query(
        "INSERT INTO sync_outbox (id, table_name, row_id, operation, payload, scope_id, changed_at, synced_at)
         VALUES ('outbox-1', 'items', 'item-1', 'insert', '{}', 'scope-1', '2026-05-20T00:00:00.000Z', NULL)",
    )
    .execute(&*harness.state.pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO sync_cursors (scope_id, last_cursor, updated_at)
         VALUES ('scope-1', 'sync:phase14', '2026-05-20T00:00:01.000Z')",
    )
    .execute(&*harness.state.pool)
    .await
    .unwrap();

    let state = get_sync_local_state_with_state(&harness.state, "scope-1".to_string())
        .await
        .unwrap();

    assert_eq!(state.local_dirty_count, 1);
    assert_eq!(state.last_server_watermark, "sync:phase14");
    assert!(!state.needs_baseline_sync);
}

#[tokio::test]
async fn maintenance_commands_purge_synced_outbox_and_collect_deleted_rows() {
    let harness = TestCommandState::new().await;
    run_migrations_with_state(&harness.state).await.unwrap();

    sqlx::query(
        "INSERT INTO sync_outbox (id, table_name, row_id, operation, payload, scope_id, changed_at, synced_at)
         VALUES ('old-synced', 'items', 'item-1', 'update', '{}', 'scope-1', '2026-05-18T00:00:00.000Z', '2026-05-18T00:00:01.000Z')",
    )
    .execute(&*harness.state.pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO sync_outbox (id, table_name, row_id, operation, payload, scope_id, changed_at, synced_at)
         VALUES ('new-synced', 'items', 'item-2', 'update', '{}', 'scope-1', '2026-05-20T00:00:00.000Z', '2026-05-20T00:00:01.000Z')",
    )
    .execute(&*harness.state.pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO sync_outbox (id, table_name, row_id, operation, payload, scope_id, changed_at, synced_at)
         VALUES ('pending', 'items', 'item-3', 'update', '{}', 'scope-1', '2026-05-20T00:00:00.000Z', NULL)",
    )
    .execute(&*harness.state.pool)
    .await
    .unwrap();

    let purged =
        purge_synced_outbox_with_state(&harness.state, "2026-05-19T00:00:00.000Z".to_string())
            .await
            .unwrap();
    assert_eq!(purged, 1);

    sqlx::query(
        "INSERT INTO items (id, name, deleted_at, is_synced)
         VALUES ('item-1', 'Deleted', '2026-05-19T00:00:00.000Z', 1)",
    )
    .execute(&*harness.state.pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO items (id, name, deleted_at, is_synced)
         VALUES ('item-2', 'Pending delete', '2026-05-19T00:00:00.000Z', 0)",
    )
    .execute(&*harness.state.pool)
    .await
    .unwrap();

    let collected = run_garbage_collection_with_state(&harness.state, "scope-1".to_string())
        .await
        .unwrap();
    assert_eq!(collected, 1);

    let remaining_items: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM items")
        .fetch_one(&*harness.state.pool)
        .await
        .unwrap();
    assert_eq!(remaining_items, 1);
}
