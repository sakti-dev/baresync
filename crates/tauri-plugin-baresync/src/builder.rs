use baresync_core::config::SyncEngineConfig;
use baresync_core::engine::SyncContractTables;
use baresync_core::http::SyncHttpTransport;
use baresync_core::migrations::{self, EmbeddedMigration, MigrationConfig};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::{
    path::BaseDirectory,
    plugin::{Builder as TauriPluginBuilder, TauriPlugin},
    AppHandle, Emitter, Manager, Runtime,
};
use tokio::sync::Notify;

use crate::commands::{PluginEvent, PluginEventSink, PluginState};
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
    encoding: Option<String>,
    max_push_bytes: Option<usize>,
    max_push_rows: Option<usize>,
    db_path: Option<String>,
    contract_tables: Option<SyncContractTables>,
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
            encoding: None,
            max_push_bytes: None,
            max_push_rows: None,
            db_path: None,
            contract_tables: None,
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

    pub fn encoding(mut self, enc: impl Into<String>) -> Self {
        self.encoding = Some(enc.into());
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

    pub fn contract_tables(mut self, tables: SyncContractTables) -> Self {
        self.contract_tables = Some(tables);
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

    pub fn build<R: Runtime>(self) -> TauriPlugin<R, PluginConfig> {
        let config = PluginConfig {
            api_base_url: self.api_base_url.unwrap_or_default(),
            encoding: self.encoding.unwrap_or_else(|| "json".to_string()),
            max_push_bytes: self.max_push_bytes.unwrap_or(256 * 1024),
            max_push_rows: self.max_push_rows.unwrap_or(2000),
            db_path: self.db_path.unwrap_or_else(|| "baresync.db".to_string()),
            contract_tables: self.contract_tables.unwrap_or(SyncContractTables {
                upsert_order: vec![],
                delete_order: vec![],
                local_only_columns: vec![],
            }),
            transport: self.transport,
            poll_interval_secs: self.poll_interval_secs.unwrap_or(30),
            poll_on_background: self.poll_on_background.unwrap_or(false),
        };

        let embedded_migrations = self.embedded_migrations;
        let migrations_path = self.migrations_path;

        TauriPluginBuilder::<R, PluginConfig>::new("baresync")
            .setup(move |app, _api| {
                let config = config.clone();
                validate_migration_sources(&embedded_migrations, migrations_path.as_deref())
                    .map_err(|message| -> Box<dyn std::error::Error> { message.into() })?;

                let resolved_migrations_path = migrations_path.as_deref().map_or(Ok(None), |path| {
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

                let pool = tauri::async_runtime::block_on(async {
                    baresync_core::db::connect_db(&config.db_path)
                        .await
                        .map_err(|e| -> Box<dyn std::error::Error> {
                            format!("Failed to connect to database: {}", e).into()
                        })
                })?;

                let transport = resolve_transport(&config)?;

                let sync_config = SyncEngineConfig {
                    api_url: config.api_base_url.clone(),
                    encoding: config.encoding.clone(),
                    max_push_bytes: config.max_push_bytes,
                    max_push_rows: config.max_push_rows,
                    transport,
                    ..Default::default()
                };

                let migration_config = MigrationConfig::strict();
                tauri::async_runtime::block_on(async {
                    migrations::run_migrations(&pool, &migration_config, &embedded_migrations)
                        .await
                        .map_err(|e| -> Box<dyn std::error::Error> {
                            format!("Failed to run embedded migrations: {}", e).into()
                        })?;
                    if let Some(path) = &resolved_migrations_path {
                        migrations::run_migration_files(&pool, &migration_config, path)
                            .await
                            .map_err(|e| -> Box<dyn std::error::Error> {
                                format!("Failed to run migrations from {}: {}", path.display(), e)
                                    .into()
                            })?;
                    }
                    Ok::<(), Box<dyn std::error::Error>>(())
                })?;

                app.manage(PluginState {
                    pool: Arc::new(pool),
                    sync_config,
                    contract_tables: config.contract_tables.clone(),
                    db_path: PathBuf::from(&config.db_path),
                    embedded_migrations: Arc::new(embedded_migrations),
                    migrations_path: resolved_migrations_path.clone(),
                    poll_notify: Arc::new(Notify::new()),
                    sync_in_progress: Arc::new(AtomicBool::new(false)),
                    poll_control_tx: tokio::sync::Mutex::new(None),
                    poll_task_handle: tokio::sync::Mutex::new(None),
                    poll_state: Arc::new(tokio::sync::Mutex::new(PollingState {
                        paused: false,
                        last_sync_at: None,
                    })),
                    poll_interval_secs: config.poll_interval_secs,
                    poll_on_background: config.poll_on_background,
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

fn resolve_transport(config: &PluginConfig) -> Result<Arc<dyn SyncHttpTransport>, std::io::Error> {
    Ok(config
        .transport
        .clone()
        .unwrap_or_else(baresync_core::http::default_transport))
}

#[cfg(test)]
mod tests {
    use super::{resolve_transport, resolve_migrations_path, validate_migration_sources};
    use crate::config::PluginConfig;
    use baresync_core::migrations::EmbeddedMigration;
    use baresync_core::engine::SyncContractTables;
    use baresync_core::http::SyncHttpTransport;
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

    fn test_config(encoding: &str, transport: Option<Arc<dyn SyncHttpTransport>>) -> PluginConfig {
        PluginConfig {
            api_base_url: "http://127.0.0.1:18181".to_string(),
            encoding: encoding.to_string(),
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
    #[test]
    fn json_uses_default_transport_when_missing() {
        assert!(resolve_transport(&test_config("json", None)).is_ok());
    }

    #[test]
    fn explicit_transport_is_used_when_present() {
        let transport: Arc<dyn SyncHttpTransport> = Arc::new(MockTransport);
        let resolved = resolve_transport(&test_config("json", Some(transport.clone())))
            .expect("explicit transport should resolve");
        assert!(Arc::ptr_eq(&transport, &resolved));
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
}
