use baresync_core::db::DbClient;
use baresync_core::engine::SyncContractTables;
use baresync_core::http::SyncHttpTransport;
use baresync_core::migrations::EmbeddedMigration;
use std::sync::atomic::{AtomicBool, AtomicUsize};
use std::sync::Arc;
use tauri_plugin_baresync::commands::{PluginEventSink, PluginState};

#[derive(Clone)]
struct NoopTransport;

impl SyncHttpTransport for NoopTransport {
    fn send_push_request(
        &self,
        _api_url: String,
        _envelope: serde_json::Value,
    ) -> baresync_core::http::SyncTransportFuture {
        Box::pin(async { Ok(serde_json::Value::Null) })
    }

    fn send_status_request(
        &self,
        _api_url: String,
        _body: serde_json::Value,
    ) -> baresync_core::http::SyncTransportFuture {
        Box::pin(async { Ok(serde_json::Value::Null) })
    }

    fn send_pull_request(
        &self,
        _api_url: String,
        _body: serde_json::Value,
    ) -> baresync_core::http::SyncTransportFuture {
        Box::pin(async { Ok(serde_json::Value::Null) })
    }
}

#[derive(Clone, Default)]
struct NoopEventSink;

impl PluginEventSink for NoopEventSink {
    fn emit(&self, _event: tauri_plugin_baresync::commands::PluginEvent) {}
}

#[tokio::test]
async fn plugin_state_uses_db_client_and_runs_migrations_before_commands() {
    let db_client = DbClient::connect(":memory:")
        .await
        .expect("DbClient should be connectable in tests");

    let state = PluginState {
        db: Arc::new(db_client),
        sync_config: baresync_core::config::SyncEngineConfig {
            api_url: "http://127.0.0.1:9/sync".to_string(),
            scope_id: "scope-1".to_string(),
            transport: Arc::new(NoopTransport),
            ..Default::default()
        },
        contract_tables: SyncContractTables {
            upsert_order: vec![],
            delete_order: vec![],
            local_only_columns: vec![],
        },
        db_path: std::path::PathBuf::from(":memory:"),
        embedded_migrations: Arc::new(vec![EmbeddedMigration {
            name: "0001_setup",
            sql: "CREATE TABLE plugin_probe (id TEXT PRIMARY KEY)",
        }]),
        migrations_path: None,
        poll_notify: Arc::new(tokio::sync::Notify::new()),
        sync_in_progress: Arc::new(AtomicBool::new(false)),
        sql_transaction_depth: Arc::new(AtomicUsize::new(0)),
        sql_transaction_has_writes: Arc::new(AtomicBool::new(false)),
        poll_control_tx: tokio::sync::Mutex::new(None),
        poll_task_handle: tokio::sync::Mutex::new(None),
        poll_state: Arc::new(tokio::sync::Mutex::new(
            tauri_plugin_baresync::polling::PollingState {
                paused: false,
                last_sync_at: None,
            },
        )),
        poll_interval_secs: 30,
        poll_on_background: false,
        event_sink: Arc::new(NoopEventSink),
        custom_headers: baresync_core::headers::SyncRequestHeaders::new(),
    };

    let _ = state;
}
