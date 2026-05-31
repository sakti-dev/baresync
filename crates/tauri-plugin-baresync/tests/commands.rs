use baresync_core::config::SyncEngineConfig;
use baresync_core::db::DbClient;
use baresync_core::drizzle_proxy::{SqlQuery, SqlStatement};
use baresync_core::engine::SyncContractTables;
use baresync_core::http::{SyncHttpTransport, SyncTransportFuture};
use baresync_core::migrations::EmbeddedMigration;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri_plugin_baresync::commands::{
    get_db_info_with_state, get_migration_status_with_state, get_sync_local_state_with_state,
    handle_window_focus_for_state, pause_polling_with_state, purge_synced_outbox_with_state,
    resume_polling_with_state, run_garbage_collection_with_state, run_migrations_with_state,
    run_sql_batch_with_state, run_sql_with_state, start_polling_with_state,
    stop_polling_with_state, sync_full_resync_with_state, sync_now_with_state,
    sync_pull_with_state, sync_push_with_state, PluginEvent, PluginEventSink, PluginState,
};
use tauri_plugin_baresync::polling::PollingState;
use tokio::sync::Notify;

#[derive(Clone, Default)]
struct RecordingEventSink {
    events: Arc<std::sync::Mutex<Vec<String>>>,
}

impl RecordingEventSink {
    async fn events(&self) -> Vec<String> {
        self.events
            .lock()
            .expect("event sink mutex poisoned")
            .clone()
    }
}

impl PluginEventSink for RecordingEventSink {
    fn emit(&self, event: PluginEvent) {
        let mut guard = self.events.lock().expect("event sink mutex poisoned");
        guard.push(match event {
            PluginEvent::DataChanged => "baresync://data-changed".to_string(),
            PluginEvent::SyncStatusChanged => "baresync://sync-status-changed".to_string(),
        });
    }
}

#[derive(Clone)]
struct RecordingTransport {
    push_response: Value,
    status_response: Value,
    pull_response: Value,
}

impl RecordingTransport {
    fn new(push_response: Value, status_response: Value, pull_response: Value) -> Self {
        Self {
            push_response,
            status_response,
            pull_response,
        }
    }
}

impl SyncHttpTransport for RecordingTransport {
    fn send_push_request(&self, _api_url: String, _envelope: Value) -> SyncTransportFuture {
        let response = self.push_response.clone();
        Box::pin(async move { Ok(response) })
    }

    fn send_status_request(&self, _api_url: String, _body: Value) -> SyncTransportFuture {
        let response = self.status_response.clone();
        Box::pin(async move { Ok(response) })
    }

    fn send_pull_request(&self, _api_url: String, _body: Value) -> SyncTransportFuture {
        let response = self.pull_response.clone();
        Box::pin(async move { Ok(response) })
    }
}

fn pull_response_with_rows(rows: Vec<Value>) -> Value {
    Value::Object(
        serde_json::json!({
            "cursor": "sync:phase14",
            "hasMore": false,
            "serverTime": "2026-05-20T00:00:00.000Z",
            "tables": [{
                "table": "items",
                "changedRows": rows,
                "deletedIds": []
            }]
        })
        .as_object()
        .cloned()
        .unwrap_or_default(),
    )
}

fn push_response_with_table_ack() -> Value {
    serde_json::json!({
        "tables": [{
            "table": "items",
            "acceptedCreatedIds": ["item-1"],
            "acceptedUpdatedIds": [],
            "acceptedDeletedIds": [],
            "rejected": []
        }],
        "serverTime": "2026-05-20T00:00:00.000Z",
    })
}

fn status_response(has_changes: bool) -> Value {
    if has_changes {
        serde_json::json!({
            "changedTables": ["items"],
            "hasChanges": true,
            "cursor": "sync:phase14",
            "serverTime": "2026-05-20T00:00:00.000Z",
        })
    } else {
        serde_json::json!({
            "changedTables": [],
            "hasChanges": false,
            "cursor": "sync:phase14",
            "serverTime": "2026-05-20T00:00:00.000Z",
        })
    }
}

async fn exec_sql(db: &DbClient, sql: &str) {
    db.execute(sql, vec![]).await.unwrap();
}

async fn query_scalar_i64(db: &DbClient, sql: &str) -> i64 {
    let rows = db.query(sql, vec![]).await.unwrap();
    rows[0].values[0].as_i64().unwrap()
}

struct TestCommandState {
    state: PluginState,
    event_sink: RecordingEventSink,
}

impl TestCommandState {
    async fn new() -> Self {
        Self::new_with_transport(baresync_core::http::default_transport()).await
    }

    async fn new_with_transport(transport: Arc<dyn SyncHttpTransport>) -> Self {
        let db_path = temp_db_path();
        let event_sink = RecordingEventSink::default();
        let db = DbClient::connect(&db_path).await.unwrap();

        let state = PluginState {
            db: Arc::new(db.clone()),
            sync_config: SyncEngineConfig {
                api_url: "http://127.0.0.1:9/sync".to_string(),
                scope_id: "scope-1".to_string(),
                transport,
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
                        is_synced INTEGER NOT NULL DEFAULT 0,
                        created_at TEXT,
                        updated_at TEXT
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
            migrations_path: None,
            poll_notify: Arc::new(Notify::new()),
            sync_in_progress: Arc::new(AtomicBool::new(false)),
            sql_transaction_depth: Arc::new(AtomicUsize::new(0)),
            sql_transaction_has_writes: Arc::new(AtomicBool::new(false)),
            poll_control_tx: tokio::sync::Mutex::new(None),
            poll_task_handle: tokio::sync::Mutex::new(None),
            poll_state: Arc::new(tokio::sync::Mutex::new(PollingState {
                paused: false,
                last_sync_at: None,
            })),
            poll_interval_secs: 30,
            poll_on_background: false,
            event_sink: Arc::new(event_sink.clone()),
        };

        Self { state, event_sink }
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
async fn db_proxy_commands_emit_data_changed_for_writes_only() {
    let harness = TestCommandState::new().await;
    run_migrations_with_state(&harness.state).await.unwrap();
    exec_sql(
        &harness.state.db,
        "CREATE TABLE db_proxy_items (id TEXT PRIMARY KEY, name TEXT NOT NULL)",
    )
    .await;

    run_sql_with_state(
        &harness.state,
        SqlQuery {
            sql: "INSERT INTO db_proxy_items (id, name) VALUES ('item-1', 'Coffee')".to_string(),
            params: vec![],
            method: "run".to_string(),
        },
    )
    .await
    .unwrap();

    let events = harness.event_sink.events().await;
    assert_eq!(events, vec!["baresync://data-changed".to_string()]);
}

#[tokio::test]
async fn db_proxy_commands_do_not_emit_data_changed_for_reads_or_zero_row_writes() {
    let harness = TestCommandState::new().await;
    run_migrations_with_state(&harness.state).await.unwrap();
    exec_sql(
        &harness.state.db,
        "CREATE TABLE db_proxy_items (id TEXT PRIMARY KEY, name TEXT NOT NULL)",
    )
    .await;

    run_sql_with_state(
        &harness.state,
        SqlQuery {
            sql: "SELECT id, name FROM db_proxy_items".to_string(),
            params: vec![],
            method: "all".to_string(),
        },
    )
    .await
    .unwrap();

    run_sql_batch_with_state(
        &harness.state,
        vec![SqlStatement {
            sql: "UPDATE db_proxy_items SET name = 'Coffee' WHERE id = 'missing'".to_string(),
            params: vec![],
        }],
    )
    .await
    .unwrap();

    let events = harness.event_sink.events().await;
    assert!(events.is_empty());
}

#[tokio::test]
async fn db_proxy_batch_commands_emit_data_changed_for_nonzero_rows_only() {
    let harness = TestCommandState::new().await;
    run_migrations_with_state(&harness.state).await.unwrap();
    exec_sql(
        &harness.state.db,
        "CREATE TABLE db_proxy_items (id TEXT PRIMARY KEY, name TEXT NOT NULL)",
    )
    .await;

    run_sql_batch_with_state(
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

    let events = harness.event_sink.events().await;
    assert_eq!(events, vec!["baresync://data-changed".to_string()]);
}

#[tokio::test]
async fn sync_pull_emits_data_changed_when_rows_are_applied() {
    let transport = Arc::new(RecordingTransport::new(
        serde_json::json!({ "tables": [], "serverTime": "2026-05-20T00:00:00.000Z" }),
        status_response(false),
        pull_response_with_rows(vec![serde_json::json!({
            "id": "item-1",
            "name": "Pulled Item",
            "deletedAt": null
        })]),
    ));
    let harness = TestCommandState::new_with_transport(transport).await;
    run_migrations_with_state(&harness.state).await.unwrap();

    sync_pull_with_state(&harness.state, "scope-1".to_string())
        .await
        .unwrap();

    let events = harness.event_sink.events().await;
    assert_eq!(
        events,
        vec![
            "baresync://data-changed".to_string(),
            "baresync://sync-status-changed".to_string(),
        ]
    );
}

#[tokio::test]
async fn sync_push_emits_data_changed_when_rows_are_accepted() {
    let transport = Arc::new(RecordingTransport::new(
        push_response_with_table_ack(),
        status_response(false),
        pull_response_with_rows(Vec::new()),
    ));
    let harness = TestCommandState::new_with_transport(transport).await;
    run_migrations_with_state(&harness.state).await.unwrap();

    exec_sql(
        &harness.state.db,
        "INSERT INTO items (id, name, deleted_at, is_synced) VALUES ('item-1', 'Coffee', NULL, 0)",
    )
    .await;
    exec_sql(&harness.state.db, "INSERT INTO sync_outbox (id, table_name, row_id, operation, payload, scope_id, changed_at, synced_at) VALUES ('outbox-1', 'items', 'item-1', 'insert', '{}', 'scope-1', '2026-05-20T00:00:00.000Z', NULL)").await;

    sync_push_with_state(&harness.state, "scope-1".to_string())
        .await
        .unwrap();

    let events = harness.event_sink.events().await;
    assert_eq!(
        events,
        vec![
            "baresync://data-changed".to_string(),
            "baresync://sync-status-changed".to_string(),
        ]
    );
}

#[tokio::test]
async fn sync_now_emits_data_changed_when_push_changes_local_rows() {
    let transport = Arc::new(RecordingTransport::new(
        push_response_with_table_ack(),
        status_response(false),
        pull_response_with_rows(Vec::new()),
    ));
    let harness = TestCommandState::new_with_transport(transport).await;
    run_migrations_with_state(&harness.state).await.unwrap();

    exec_sql(&harness.state.db, "INSERT INTO items (id, name, deleted_at, is_synced, created_at, updated_at) VALUES ('item-1', 'Coffee', NULL, 0, '2026-05-20T00:00:00.000Z', '2026-05-20T00:00:00.000Z')").await;
    exec_sql(&harness.state.db, "INSERT INTO sync_outbox (id, table_name, row_id, operation, payload, scope_id, changed_at, synced_at) VALUES ('outbox-1', 'items', 'item-1', 'insert', '{}', 'scope-1', '2026-05-20T00:00:00.000Z', NULL)").await;

    sync_now_with_state(&harness.state, "scope-1".to_string())
        .await
        .unwrap();

    let events = harness.event_sink.events().await;
    assert_eq!(
        events,
        vec![
            "baresync://data-changed".to_string(),
            "baresync://sync-status-changed".to_string(),
        ]
    );
}

#[tokio::test]
async fn sync_now_rejects_overlapping_sync() {
    let transport = Arc::new(RecordingTransport::new(
        push_response_with_table_ack(),
        status_response(false),
        pull_response_with_rows(Vec::new()),
    ));
    let harness = TestCommandState::new_with_transport(transport).await;
    run_migrations_with_state(&harness.state).await.unwrap();
    harness.state.sync_in_progress.store(true, Ordering::Release);

    let result = sync_now_with_state(&harness.state, "scope-1".to_string()).await;

    assert_eq!(result.unwrap_err(), "Sync already in progress");
}

#[tokio::test]
async fn sync_full_resync_emits_data_changed_when_pull_and_push_change_rows() {
    let transport = Arc::new(RecordingTransport::new(
        push_response_with_table_ack(),
        status_response(false),
        pull_response_with_rows(vec![serde_json::json!({
            "id": "item-1",
            "name": "Pulled Item",
            "deletedAt": null
        })]),
    ));
    let harness = TestCommandState::new_with_transport(transport).await;
    run_migrations_with_state(&harness.state).await.unwrap();
    exec_sql(&harness.state.db, "INSERT INTO sync_outbox (id, table_name, row_id, operation, payload, scope_id, changed_at, synced_at) VALUES ('outbox-1', 'items', 'item-1', 'insert', '{}', 'scope-1', '2026-05-20T00:00:00.000Z', NULL)").await;

    sync_full_resync_with_state(&harness.state, "scope-1".to_string())
        .await
        .unwrap();

    let events = harness.event_sink.events().await;
    assert_eq!(
        events,
        vec![
            "baresync://data-changed".to_string(),
            "baresync://sync-status-changed".to_string(),
        ]
    );
}

#[tokio::test]
async fn manual_sync_completion_emits_sync_status_changed_even_without_data_changes() {
    let transport = Arc::new(RecordingTransport::new(
        serde_json::json!({ "tables": [], "serverTime": "2026-05-20T00:00:00.000Z" }),
        status_response(false),
        pull_response_with_rows(Vec::new()),
    ));
    let harness = TestCommandState::new_with_transport(transport).await;
    run_migrations_with_state(&harness.state).await.unwrap();

    sync_pull_with_state(&harness.state, "scope-1".to_string())
        .await
        .unwrap();

    let events = harness.event_sink.events().await;
    assert_eq!(events, vec!["baresync://sync-status-changed".to_string()]);
}

#[tokio::test]
async fn polling_controls_emit_sync_status_changed_for_pause_resume_and_stop() {
    let harness = TestCommandState::new().await;
    let (tx, rx) = tokio::sync::mpsc::channel(1);
    *harness.state.poll_control_tx.lock().await = Some(tx);
    *harness.state.poll_task_handle.lock().await = Some(tokio::spawn(async move {
        drop(rx);
    }));

    pause_polling_with_state(&harness.state).await.unwrap();
    resume_polling_with_state(&harness.state).await.unwrap();
    stop_polling_with_state(&harness.state).await.unwrap();

    let events = harness.event_sink.events().await;
    assert_eq!(
        events,
        vec![
            "baresync://sync-status-changed".to_string(),
            "baresync://sync-status-changed".to_string(),
            "baresync://sync-status-changed".to_string(),
        ]
    );
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

    let item_table_count = query_scalar_i64(
        &harness.state.db,
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'items'",
    )
    .await;
    assert_eq!(item_table_count, 1);
}

#[tokio::test]
async fn migration_commands_apply_filesystem_migrations_from_path() {
    let migration_dir = std::env::temp_dir().join(format!(
        "baresync-migration-path-test-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&migration_dir).unwrap();
    fs::write(
        migration_dir.join("0001_create_path_items.sql"),
        "CREATE TABLE path_items (id TEXT PRIMARY KEY, name TEXT NOT NULL)",
    )
    .unwrap();

    let db_path = temp_db_path();
    let harness = TestCommandState {
        state: PluginState {
            db: Arc::new(DbClient::connect(&db_path).await.unwrap()),
            sync_config: SyncEngineConfig {
                api_url: "http://127.0.0.1:9/sync".to_string(),
                scope_id: "scope-1".to_string(),
                transport: baresync_core::http::default_transport(),
                ..Default::default()
            },
            contract_tables: SyncContractTables {
                upsert_order: vec!["path_items".to_string()],
                delete_order: vec!["path_items".to_string()],
                local_only_columns: vec![],
            },
            db_path,
            embedded_migrations: Arc::new(vec![]),
            migrations_path: Some(migration_dir.clone()),
            poll_notify: Arc::new(Notify::new()),
            sync_in_progress: Arc::new(AtomicBool::new(false)),
            sql_transaction_depth: Arc::new(AtomicUsize::new(0)),
            sql_transaction_has_writes: Arc::new(AtomicBool::new(false)),
            poll_control_tx: tokio::sync::Mutex::new(None),
            poll_task_handle: tokio::sync::Mutex::new(None),
            poll_state: Arc::new(tokio::sync::Mutex::new(PollingState {
                paused: false,
                last_sync_at: None,
            })),
            poll_interval_secs: 30,
            poll_on_background: false,
            event_sink: Arc::new(RecordingEventSink::default()),
        },
        event_sink: RecordingEventSink::default(),
    };

    run_migrations_with_state(&harness.state).await.unwrap();

    let table_count = query_scalar_i64(
        &harness.state.db,
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'path_items'",
    )
    .await;
    assert_eq!(table_count, 1);

    let _ = fs::remove_dir_all(&migration_dir);
}

#[tokio::test]
async fn local_state_command_reports_seeded_outbox_and_cursor() {
    let harness = TestCommandState::new().await;
    run_migrations_with_state(&harness.state).await.unwrap();

    exec_sql(&harness.state.db, "INSERT INTO sync_outbox (id, table_name, row_id, operation, payload, scope_id, changed_at, synced_at) VALUES ('outbox-1', 'items', 'item-1', 'insert', '{}', 'scope-1', '2026-05-20T00:00:00.000Z', NULL)").await;

    exec_sql(&harness.state.db, "INSERT INTO sync_cursors (scope_id, last_cursor, updated_at) VALUES ('scope-1', 'sync:phase14', '2026-05-20T00:00:01.000Z')").await;

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

    exec_sql(&harness.state.db, "INSERT INTO sync_outbox (id, table_name, row_id, operation, payload, scope_id, changed_at, synced_at) VALUES ('old-synced', 'items', 'item-1', 'update', '{}', 'scope-1', '2026-05-18T00:00:00.000Z', '2026-05-18T00:00:01.000Z')").await;
    exec_sql(&harness.state.db, "INSERT INTO sync_outbox (id, table_name, row_id, operation, payload, scope_id, changed_at, synced_at) VALUES ('new-synced', 'items', 'item-2', 'update', '{}', 'scope-1', '2026-05-20T00:00:00.000Z', '2026-05-20T00:00:01.000Z')").await;
    exec_sql(&harness.state.db, "INSERT INTO sync_outbox (id, table_name, row_id, operation, payload, scope_id, changed_at, synced_at) VALUES ('pending', 'items', 'item-3', 'update', '{}', 'scope-1', '2026-05-20T00:00:00.000Z', NULL)").await;

    let purged =
        purge_synced_outbox_with_state(&harness.state, "2026-05-19T00:00:00.000Z".to_string())
            .await
            .unwrap();
    assert_eq!(purged, 1);

    exec_sql(&harness.state.db, "INSERT INTO items (id, name, deleted_at, is_synced) VALUES ('item-1', 'Deleted', '2026-05-19T00:00:00.000Z', 1)").await;
    exec_sql(&harness.state.db, "INSERT INTO items (id, name, deleted_at, is_synced) VALUES ('item-2', 'Pending delete', '2026-05-19T00:00:00.000Z', 0)").await;

    let collected = run_garbage_collection_with_state(&harness.state, "scope-1".to_string())
        .await
        .unwrap();
    assert_eq!(collected, 1);

    let remaining_items = query_scalar_i64(&harness.state.db, "SELECT COUNT(*) FROM items").await;
    assert_eq!(remaining_items, 1);
}

#[tokio::test]
async fn start_polling_does_not_replace_an_existing_task() {
    let harness = TestCommandState::new().await;
    let pending_handle = tokio::spawn(async {
        core::future::pending::<()>().await;
    });

    *harness.state.poll_task_handle.lock().await = Some(pending_handle);
    *harness.state.poll_control_tx.lock().await = Some(tokio::sync::mpsc::channel(1).0);

    start_polling_with_state(&harness.state, "scope-1".to_string())
        .await
        .unwrap();

    let timed_out = tokio::time::timeout(
        std::time::Duration::from_millis(100),
        stop_polling_with_state(&harness.state),
    )
    .await
    .is_err();

    assert!(timed_out);

    let mut handle_guard = harness.state.poll_task_handle.lock().await;
    if let Some(handle) = handle_guard.take() {
        handle.abort();
    }
}

#[tokio::test]
async fn background_lifecycle_events_pause_and_resume_polling() {
    let harness = TestCommandState::new().await;
    let sync_count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let sync_count_clone = sync_count.clone();
    let sync_fn = move |_scope_id: String| {
        let count = sync_count_clone.clone();
        async move {
            count.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            Ok(tauri_plugin_baresync::polling::PollingSyncOutcome::completed(true))
        }
    };

    let event_sink = harness.state.event_sink.clone();
    let (tx, rx) = tokio::sync::mpsc::channel(10);
    let notify = harness.state.poll_notify.clone();
    let sync_in_progress = harness.state.sync_in_progress.clone();
    let state = harness.state.poll_state.clone();

    let handle = tokio::spawn(tauri_plugin_baresync::polling::polling_loop(
        "scope-1".to_string(),
        1,
        sync_fn,
        event_sink,
        notify,
        rx,
        sync_in_progress,
        state,
    ));

    *harness.state.poll_control_tx.lock().await = Some(tx);

    handle_window_focus_for_state(&harness.state, false);

    tokio::time::sleep(std::time::Duration::from_millis(250)).await;
    assert_eq!(sync_count.load(std::sync::atomic::Ordering::Relaxed), 0);

    handle_window_focus_for_state(&harness.state, true);

    tokio::time::sleep(std::time::Duration::from_millis(1300)).await;
    assert!(sync_count.load(std::sync::atomic::Ordering::Relaxed) >= 1);

    stop_polling_with_state(&harness.state).await.unwrap();
    handle.await.unwrap();
}
