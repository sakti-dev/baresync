use baresync_core::config::SyncEngineConfig;
use baresync_core::engine::SyncContractTables;
use baresync_core::http::SyncHttpTransport;
use baresync_core::migrations::{self, EmbeddedMigration, MigrationConfig};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::{
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
    migrations_dir: Option<PathBuf>,
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
            migrations_dir: None,
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

    pub fn migrations_dir(mut self, dir: impl Into<PathBuf>) -> Self {
        self.migrations_dir = Some(dir.into());
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
            poll_interval_secs: self.poll_interval_secs.unwrap_or(30),
            poll_on_background: self.poll_on_background.unwrap_or(false),
        };

        let embedded_migrations = self.embedded_migrations;
        let migrations_dir = self.migrations_dir;
        let transport = self.transport;

        TauriPluginBuilder::<R, PluginConfig>::new("baresync")
            .setup(move |app, _api| {
                let config = config.clone();
                let pool = tauri::async_runtime::block_on(async {
                    baresync_core::db::connect_db(&config.db_path)
                        .await
                        .map_err(|e| -> Box<dyn std::error::Error> {
                            format!("Failed to connect to database: {}", e).into()
                        })
                })?;

                let sync_config = SyncEngineConfig {
                    api_url: config.api_base_url.clone(),
                    encoding: config.encoding.clone(),
                    max_push_bytes: config.max_push_bytes,
                    max_push_rows: config.max_push_rows,
                    transport: transport
                        .clone()
                        .unwrap_or_else(baresync_core::http::default_transport),
                    ..Default::default()
                };

                let migration_config = MigrationConfig::strict();
                tauri::async_runtime::block_on(async {
                    migrations::run_migrations(&pool, &migration_config, &embedded_migrations)
                        .await
                        .map_err(|e| -> Box<dyn std::error::Error> {
                            format!("Failed to run embedded migrations: {}", e).into()
                        })?;
                    if let Some(dir) = &migrations_dir {
                        migrations::run_migration_files(&pool, &migration_config, dir)
                            .await
                            .map_err(|e| -> Box<dyn std::error::Error> {
                                format!("Failed to run migrations from {}: {}", dir.display(), e)
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
                    migrations_dir: migrations_dir.clone(),
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
