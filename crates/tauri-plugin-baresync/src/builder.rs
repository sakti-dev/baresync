use baresync_core::config::SyncEngineConfig;
use baresync_core::engine::SyncContractTables;
use baresync_core::http::SyncHttpTransport;
use baresync_core::migrations::EmbeddedMigration;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{
    plugin::{Builder as TauriPluginBuilder, TauriPlugin},
    Manager, Runtime,
};

use crate::commands::PluginState;
use crate::config::PluginConfig;

pub struct Builder {
    api_base_url: Option<String>,
    encoding: Option<String>,
    max_push_bytes: Option<usize>,
    max_push_rows: Option<usize>,
    db_path: Option<String>,
    contract_tables: Option<SyncContractTables>,
    embedded_migrations: Vec<EmbeddedMigration>,
    transport: Option<Arc<dyn SyncHttpTransport>>,
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
            transport: None,
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

    pub fn transport(mut self, transport: Arc<dyn SyncHttpTransport>) -> Self {
        self.transport = Some(transport);
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
        };

        let embedded_migrations = self.embedded_migrations;
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

                app.manage(PluginState {
                    pool: Arc::new(pool),
                    sync_config,
                    contract_tables: config.contract_tables.clone(),
                    db_path: PathBuf::from(&config.db_path),
                    embedded_migrations: Arc::new(embedded_migrations),
                });

                Ok(())
            })
            .build()
    }
}
