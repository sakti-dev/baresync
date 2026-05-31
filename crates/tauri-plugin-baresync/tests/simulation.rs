use baresync_core::config::SyncEngineConfig;
use baresync_core::db::DbClient;
use baresync_core::engine::SyncContractTables;
use baresync_core::migrations::EmbeddedMigration;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri_plugin_baresync::commands::{
    get_polling_status_with_state, handle_window_focus_for_state, run_migrations_with_state,
    start_polling_with_state, stop_polling_with_state, NoopPluginEventSink, PluginState,
};
use tauri_plugin_baresync::polling::PollingState;
use tokio::sync::Notify;

struct SimulationHarness {
    state: PluginState,
}

impl SimulationHarness {
    async fn new() -> Self {
        let db_path = temp_db_path();
        let db = DbClient::connect(&db_path).await.unwrap();

        let state = PluginState {
            db: Arc::new(db),
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
            poll_interval_secs: 1,
            poll_on_background: false,
            event_sink: Arc::new(NoopPluginEventSink),
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
        "baresync-simulation-test-{}-{}.db",
        std::process::id(),
        nanos
    ))
}

#[tokio::test]
async fn background_polling_simulation_pauses_and_resumes_in_rust() {
    let harness = SimulationHarness::new().await;
    run_migrations_with_state(&harness.state).await.unwrap();

    assert_eq!(
        get_polling_status_with_state(&harness.state).await.unwrap(),
        tauri_plugin_baresync::polling::PollingStatus {
            running: false,
            paused: false,
            last_sync_at: None,
        }
    );

    start_polling_with_state(&harness.state, "scope-1".to_string())
        .await
        .unwrap();

    assert!(
        get_polling_status_with_state(&harness.state)
            .await
            .unwrap()
            .running
    );

    handle_window_focus_for_state(&harness.state, false);
    tokio::time::sleep(Duration::from_millis(250)).await;
    assert!(
        get_polling_status_with_state(&harness.state)
            .await
            .unwrap()
            .paused
    );

    let paused_status = get_polling_status_with_state(&harness.state).await.unwrap();
    tokio::time::sleep(Duration::from_millis(1200)).await;
    assert_eq!(
        get_polling_status_with_state(&harness.state)
            .await
            .unwrap()
            .last_sync_at,
        paused_status.last_sync_at
    );

    handle_window_focus_for_state(&harness.state, true);
    tokio::time::sleep(Duration::from_millis(1300)).await;
    let resumed_status = get_polling_status_with_state(&harness.state).await.unwrap();
    assert!(!resumed_status.paused);
    assert!(resumed_status.last_sync_at.is_some());

    stop_polling_with_state(&harness.state).await.unwrap();
    assert_eq!(
        get_polling_status_with_state(&harness.state).await.unwrap(),
        tauri_plugin_baresync::polling::PollingStatus {
            running: false,
            paused: false,
            last_sync_at: None,
        }
    );
}

#[tokio::test]
async fn background_polling_simulation_keeps_existing_task_idempotent() {
    let harness = SimulationHarness::new().await;
    run_migrations_with_state(&harness.state).await.unwrap();

    let sync_fn = |_scope_id: String| async move {
        Ok(tauri_plugin_baresync::polling::PollingSyncOutcome::completed(false))
    };
    let (tx, rx) = tokio::sync::mpsc::channel(1);
    let event_sink = harness.state.event_sink.clone();
    let notify = harness.state.poll_notify.clone();
    let sync_in_progress = harness.state.sync_in_progress.clone();
    let state = harness.state.poll_state.clone();

    let pending_handle = tokio::spawn(tauri_plugin_baresync::polling::polling_loop(
        "scope-1".to_string(),
        1_000,
        sync_fn,
        event_sink,
        notify,
        rx,
        sync_in_progress,
        state,
    ));

    *harness.state.poll_task_handle.lock().await = Some(pending_handle);
    *harness.state.poll_control_tx.lock().await = Some(tx);

    start_polling_with_state(&harness.state, "scope-1".to_string())
        .await
        .unwrap();

    stop_polling_with_state(&harness.state).await.unwrap();
    assert_eq!(
        get_polling_status_with_state(&harness.state).await.unwrap(),
        tauri_plugin_baresync::polling::PollingStatus {
            running: false,
            paused: false,
            last_sync_at: None,
        }
    );
}
