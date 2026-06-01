use baresync_core::config::SyncEngineConfig;
use baresync_core::db::{self, EncryptionKeyProvider};
use baresync_core::engine::SyncContractTables;
use baresync_core::http::SyncHttpTransport;
use baresync_core::migrations::{self, EmbeddedMigration, MigrationConfig};
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize};
use std::sync::Arc;
use tauri::{
    path::BaseDirectory,
    plugin::{Builder as TauriPluginBuilder, TauriPlugin},
    AppHandle, Emitter, Manager, Runtime,
};
use tokio::sync::Notify;

use crate::commands::{self, PluginEvent, PluginEventSink, PluginState};
use crate::config::PluginConfig;
use crate::polling::PollingState;

#[derive(Clone)]
struct TauriAppEventSink<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> PluginEventSink for TauriAppEventSink<R> {
    fn emit(&self, event: PluginEvent) {
        let name = match event {
            PluginEvent::DataChanged => "baresync://data-changed",
            PluginEvent::SyncStatusChanged => "baresync://sync-status-changed",
        };
        let _ = self.app.emit(name, ());
    }
}

pub struct Builder {
    api_base_url: Option<String>,
    max_push_bytes: Option<usize>,
    max_push_rows: Option<usize>,
    db_path: Option<String>,
    db_name: Option<String>,
    encryption_key_provider: Option<Arc<dyn EncryptionKeyProvider>>,
    contract_tables: Option<SyncContractTables>,
    contract_json: Option<String>,
    embedded_migrations: Vec<EmbeddedMigration>,
    migrations_path: Option<PathBuf>,
    transport: Option<Arc<dyn SyncHttpTransport>>,
    poll_interval_secs: Option<u64>,
    poll_on_background: Option<bool>,
}

impl Builder {
    pub fn new() -> Self {
        Self {
            api_base_url: None,
            max_push_bytes: None,
            max_push_rows: None,
            db_path: None,
            db_name: None,
            encryption_key_provider: None,
            contract_tables: None,
            contract_json: None,
            embedded_migrations: Vec::new(),
            migrations_path: None,
            transport: None,
            poll_interval_secs: None,
            poll_on_background: None,
        }
    }

    pub fn api_base_url(mut self, url: impl Into<String>) -> Self {
        self.api_base_url = Some(url.into());
        self
    }

    pub fn max_push_bytes(mut self, bytes: usize) -> Self {
        self.max_push_bytes = Some(bytes);
        self
    }

    pub fn max_push_rows(mut self, rows: usize) -> Self {
        self.max_push_rows = Some(rows);
        self
    }

    pub fn db_path(mut self, path: impl Into<String>) -> Self {
        self.db_path = Some(path.into());
        self
    }

    pub fn db_name(mut self, name: impl Into<String>) -> Self {
        self.db_name = Some(name.into());
        self
    }

    pub fn encryption_key_provider<P>(mut self, provider: P) -> Self
    where
        P: EncryptionKeyProvider + 'static,
    {
        self.encryption_key_provider = Some(Arc::new(provider));
        self
    }

    pub fn contract_tables(mut self, tables: SyncContractTables) -> Self {
        self.contract_tables = Some(tables);
        self
    }

    pub fn contract_json(mut self, json: impl Into<String>) -> Self {
        self.contract_json = Some(json.into());
        self
    }

    pub fn migrations(mut self, migrations: Vec<EmbeddedMigration>) -> Self {
        self.embedded_migrations = migrations;
        self
    }

    pub fn migrations_path(mut self, path: impl Into<PathBuf>) -> Self {
        self.migrations_path = Some(path.into());
        self
    }

    pub fn transport(mut self, transport: Arc<dyn SyncHttpTransport>) -> Self {
        self.transport = Some(transport);
        self
    }

    pub fn poll_interval_secs(mut self, secs: u64) -> Self {
        self.poll_interval_secs = Some(secs);
        self
    }

    pub fn poll_on_background(mut self, enabled: bool) -> Self {
        self.poll_on_background = Some(enabled);
        self
    }

    pub fn build<R: Runtime>(self) -> TauriPlugin<R, Option<PluginConfig>> {
        let api_base_url = self.api_base_url.unwrap_or_default();
        let max_push_bytes = self.max_push_bytes.unwrap_or(256 * 1024);
        let max_push_rows = self.max_push_rows.unwrap_or(2000);
        let db_path = self.db_path;
        let db_name = self.db_name;
        let encryption_key_provider = self.encryption_key_provider;
        let contract_tables = self.contract_tables;
        let contract_json = self.contract_json;
        let embedded_migrations = self.embedded_migrations;
        let migrations_path = self.migrations_path;
        let transport = self.transport;
        let poll_interval_secs = self.poll_interval_secs.unwrap_or(30);
        let poll_on_background = self.poll_on_background.unwrap_or(false);

        TauriPluginBuilder::<R, Option<PluginConfig>>::new("baresync")
            .invoke_handler(tauri::generate_handler![
                #![plugin(baresync)]
                commands::run_sql,
                commands::run_sql_batch,
                commands::get_db_info,
                commands::run_migrations,
                commands::get_migration_status,
                commands::sync_now,
                commands::sync_push,
                commands::sync_pull,
                commands::sync_full_resync,
                commands::get_sync_local_state,
                commands::purge_synced_outbox,
                commands::run_garbage_collection,
                commands::start_polling,
                commands::stop_polling,
                commands::pause_polling,
                commands::resume_polling,
                commands::get_polling_status
            ])
            .setup(move |app, _api| {
                validate_migration_sources(&embedded_migrations, migrations_path.as_deref())
                    .map_err(|message| -> Box<dyn std::error::Error> { message.into() })?;

                let resolved_db_path =
                    resolve_database_path(app, db_path.as_deref(), db_name.as_deref())?;
                let contract_tables =
                    resolve_contract_tables(contract_tables.as_ref(), contract_json.as_deref())?;
                log::info!(
                    "[baresync] plugin setup: api_url={}, db={}",
                    api_base_url,
                    resolved_db_path.display()
                );
                log::info!(
                    "[baresync] contract tables: upsert_order={:?}, delete_order={:?}, local_only_columns={:?}",
                    contract_tables.upsert_order,
                    contract_tables.delete_order,
                    contract_tables.local_only_columns
                );
                let resolved_migrations_path =
                    migrations_path.as_deref().map_or(Ok(None), |path| {
                        resolve_migrations_path(path, |relative| {
                            app.path()
                                .resolve(relative, BaseDirectory::Resource)
                                .map_err(|error| {
                                    format!(
                                        "Failed to resolve migrations path {}: {}",
                                        relative.display(),
                                        error
                                    )
                                    .into()
                                })
                        })
                    .map(Some)
                })?;

                let db = tauri::async_runtime::block_on(async {
                    if let Some(provider) = encryption_key_provider.clone() {
                        db::connect_db_with_encryption(&resolved_db_path, provider)
                            .await
                            .map_err(|e| -> Box<dyn std::error::Error> {
                                format!("Failed to connect to encrypted database: {}", e).into()
                            })
                    } else {
                        db::connect_db(&resolved_db_path)
                            .await
                            .map_err(|e| -> Box<dyn std::error::Error> {
                                format!("Failed to connect to database: {}", e).into()
                            })
                    }
                })?;

                let transport = resolve_transport(&transport)?;

                let sync_config = SyncEngineConfig {
                    api_url: api_base_url.clone(),
                    max_push_bytes,
                    max_push_rows,
                    transport,
                    ..Default::default()
                };

                let migration_config = MigrationConfig::strict();
                tauri::async_runtime::block_on(async {
                    migrations::run_migrations(&db, &migration_config, &embedded_migrations)
                        .await
                        .map_err(|e| -> Box<dyn std::error::Error> {
                            format!("Failed to run embedded migrations: {}", e).into()
                        })?;
                    if let Some(path) = &resolved_migrations_path {
                        migrations::run_migration_files(&db, &migration_config, path)
                            .await
                            .map_err(|e| -> Box<dyn std::error::Error> {
                                format!("Failed to run migrations from {}: {}", path.display(), e)
                                    .into()
                            })?;
                    }
                    Ok::<(), Box<dyn std::error::Error>>(())
                })?;

                app.manage(PluginState {
                    db: Arc::new(db),
                    sync_config,
                    contract_tables,
                    db_path: resolved_db_path,
                    embedded_migrations: Arc::new(embedded_migrations),
                    migrations_path: resolved_migrations_path.clone(),
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
                    poll_interval_secs,
                    poll_on_background,
                    event_sink: Arc::new(TauriAppEventSink { app: app.clone() }),
                });

                Ok(())
            })
            .on_event(|app, event| {
                crate::commands::handle_run_event(app, event);
            })
            .build()
    }
}

impl Default for Builder {
    fn default() -> Self {
        Self::new()
    }
}

fn validate_migration_sources(
    embedded_migrations: &[EmbeddedMigration],
    migrations_path: Option<&Path>,
) -> Result<(), String> {
    if !embedded_migrations.is_empty() && migrations_path.is_some() {
        return Err(
            "Baresync builder configured both embedded migrations and migrations_path; choose one source."
                .to_string(),
        );
    }

    Ok(())
}

fn resolve_migrations_path(
    path: &Path,
    resolve_relative: impl FnOnce(&Path) -> Result<PathBuf, Box<dyn std::error::Error>>,
) -> Result<PathBuf, Box<dyn std::error::Error>> {
    if path.is_absolute() {
        return Ok(path.to_path_buf());
    }

    resolve_relative(path)
}

fn resolve_database_path<R: Runtime>(
    app: &tauri::AppHandle<R>,
    db_path: Option<&str>,
    db_name: Option<&str>,
) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let app_data_dir = app.path().app_data_dir().map_err(|error| {
        format!("Failed to resolve app data directory for database name: {error}")
    })?;
    resolve_database_path_from_app_data_dir(db_path, db_name, Some(app_data_dir.as_path()))
}

fn resolve_database_path_from_app_data_dir(
    db_path: Option<&str>,
    db_name: Option<&str>,
    app_data_dir: Option<&Path>,
) -> Result<PathBuf, Box<dyn std::error::Error>> {
    if let Some(path) = db_path {
        return Ok(PathBuf::from(path));
    }

    if let Some(name) = db_name {
        let app_data_dir = app_data_dir.ok_or_else(|| {
            "Failed to resolve app data directory for database name".to_string()
        })?;
        return resolve_named_database_path(app_data_dir, name);
    }

    Ok(PathBuf::from("baresync.db"))
}

fn resolve_named_database_path(
    app_data_dir: &Path,
    db_name: &str,
) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let resolved = app_data_dir.join(db_name);
    if let Some(parent) = resolved.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create database directory {}: {}",
                parent.display(),
                error
            )
        })?;
    }
    Ok(resolved)
}

fn resolve_contract_tables(
    explicit: Option<&SyncContractTables>,
    contract_json: Option<&str>,
) -> Result<SyncContractTables, Box<dyn std::error::Error>> {
    if let Some(tables) = explicit {
        return Ok(tables.clone());
    }

    if let Some(json) = contract_json {
        return parse_contract_json(json)
            .map_err(|error| format!("Failed to parse generated contract JSON: {error}").into());
    }

    Ok(SyncContractTables {
        upsert_order: vec![],
        delete_order: vec![],
        local_only_columns: vec![],
    })
}

fn resolve_transport(
    transport: &Option<Arc<dyn SyncHttpTransport>>,
) -> Result<Arc<dyn SyncHttpTransport>, std::io::Error> {
    Ok(transport
        .clone()
        .unwrap_or_else(baresync_core::http::default_transport))
}

fn parse_contract_json(json: &str) -> Result<SyncContractTables, String> {
    let contract: GeneratedContractJson = serde_json::from_str(json)
        .map_err(|error| format!("invalid generated contract JSON: {error}"))?;

    if contract.upsert_order.is_empty() {
        return Err("generated contract JSON is missing `upsertOrder`".to_string());
    }

    if contract.delete_order.is_empty() {
        return Err("generated contract JSON is missing `deleteOrder`".to_string());
    }

    let mut local_only_columns = Vec::new();
    for (table_name, table) in contract.tables {
        let Some(columns) = table.local_only_columns else {
            return Err(format!(
                "generated contract JSON is missing `localOnlyColumns` for table `{table_name}`"
            ));
        };

        for column in columns {
            if !local_only_columns.contains(&column) {
                local_only_columns.push(column);
            }
        }
    }

    Ok(SyncContractTables {
        upsert_order: contract.upsert_order,
        delete_order: contract.delete_order,
        local_only_columns,
    })
}

#[derive(Deserialize)]
struct GeneratedContractJson {
    #[serde(rename = "upsertOrder")]
    upsert_order: Vec<String>,
    #[serde(rename = "deleteOrder")]
    delete_order: Vec<String>,
    tables: std::collections::BTreeMap<String, GeneratedContractTable>,
}

#[derive(Deserialize)]
struct GeneratedContractTable {
    #[serde(rename = "localOnlyColumns")]
    local_only_columns: Option<Vec<String>>,
}

#[cfg(test)]
mod tests {
    use super::{
        parse_contract_json, resolve_database_path_from_app_data_dir, resolve_migrations_path,
        resolve_named_database_path, resolve_transport, validate_migration_sources,
    };
    use crate::config::PluginConfig;
    use baresync_core::engine::SyncContractTables;
    use baresync_core::http::SyncHttpTransport;
    use baresync_core::migrations::EmbeddedMigration;
    use std::cell::Cell;
    use std::path::{Path, PathBuf};
    use std::sync::Arc;

    #[derive(Debug)]
    struct MockTransport;

    impl SyncHttpTransport for MockTransport {
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

    fn test_config(transport: Option<Arc<dyn SyncHttpTransport>>) -> PluginConfig {
        PluginConfig {
            api_base_url: "http://127.0.0.1:3001".to_string(),
            max_push_bytes: 256 * 1024,
            max_push_rows: 2000,
            db_path: ":memory:".to_string(),
            contract_tables: SyncContractTables {
                upsert_order: vec![],
                delete_order: vec![],
                local_only_columns: vec![],
            },
            transport,
            poll_interval_secs: 30,
            poll_on_background: false,
        }
    }

    #[test]
    fn default_transport_used_when_missing() {
        assert!(resolve_transport(&test_config(None).transport).is_ok());
    }

    #[test]
    fn explicit_transport_is_used_when_present() {
        let transport: Arc<dyn SyncHttpTransport> = Arc::new(MockTransport);
        let resolved = resolve_transport(&test_config(Some(transport.clone())).transport)
            .expect("explicit transport should resolve");
        assert!(Arc::ptr_eq(&transport, &resolved));
    }

    #[test]
    fn generated_contract_json_parses_order_and_local_columns() {
        let tables = parse_contract_json(
            r#"{
              "upsertOrder": ["lists", "todos"],
              "deleteOrder": ["todos", "lists"],
              "tables": {
                "lists": { "localOnlyColumns": ["is_synced"] },
                "todos": { "localOnlyColumns": ["is_synced", "draft"] }
              }
            }"#,
        )
        .expect("generated contract JSON should parse");

        assert_eq!(tables.upsert_order, vec!["lists", "todos"]);
        assert_eq!(tables.delete_order, vec!["todos", "lists"]);
        assert_eq!(tables.local_only_columns, vec!["is_synced", "draft"]);
    }

    #[test]
    fn generated_contract_json_requires_local_only_columns() {
        let error = parse_contract_json(
            r#"{
              "upsertOrder": ["lists"],
              "deleteOrder": ["lists"],
              "tables": {
                "lists": {}
              }
            }"#,
        )
        .expect_err("missing localOnlyColumns should fail");

        assert!(error.contains("localOnlyColumns"));
    }

    #[test]
    fn db_name_resolution_uses_app_data_dir_and_creates_parent_directory() {
        let base_dir = std::env::temp_dir().join(format!(
            "baresync-db-name-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&base_dir);
        let nested = base_dir.join("nested");
        let resolved = resolve_named_database_path(&nested, "sync.db")
            .expect("db name resolution should succeed");

        assert_eq!(resolved, nested.join("sync.db"));
        assert!(nested.exists());
        let _ = std::fs::remove_dir_all(&base_dir);
    }

    #[test]
    fn absolute_migrations_path_skips_resource_resolution() {
        let path = PathBuf::from("/tmp/baresync-migrations");
        let called = Cell::new(false);
        let resolved = resolve_migrations_path(&path, |_| {
            called.set(true);
            Ok(PathBuf::from("/should/not/be/used"))
        })
        .expect("absolute path should resolve directly");

        assert_eq!(resolved, path);
        assert!(!called.get());
    }

    #[test]
    fn relative_migrations_path_uses_resource_resolution() {
        let path = Path::new("migrations");
        let called = Cell::new(false);
        let resolved = resolve_migrations_path(path, |relative| {
            called.set(true);
            assert_eq!(relative, path);
            Ok(PathBuf::from("/app/resources/migrations"))
        })
        .expect("relative path should use resource resolution");

        assert_eq!(resolved, PathBuf::from("/app/resources/migrations"));
        assert!(called.get());
    }

    #[test]
    fn combined_embedded_and_path_migrations_are_rejected() {
        let embedded = vec![EmbeddedMigration {
            name: "0001_init",
            sql: "SELECT 1;",
        }];

        let error = validate_migration_sources(&embedded, Some(Path::new("migrations")))
            .expect_err("combined migration sources should be rejected");

        assert!(
            error.contains("embedded migrations") && error.contains("migrations_path"),
            "unexpected error message: {error}"
        );
    }

    #[test]
    fn explicit_database_path_takes_precedence_over_db_name() {
        let resolved = resolve_database_path_from_app_data_dir(
            Some("/tmp/custom.db"),
            Some("sync.db"),
            Some(Path::new("/tmp/app-data")),
        )
            .expect("explicit db path should resolve");

        assert_eq!(resolved, PathBuf::from("/tmp/custom.db"));
    }
}
