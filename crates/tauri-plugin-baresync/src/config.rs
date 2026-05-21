use baresync_core::engine::SyncContractTables;
use baresync_core::http::SyncHttpTransport;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Clone, Deserialize, Serialize)]
pub struct PluginConfig {
    pub api_base_url: String,
    pub encoding: String,
    pub max_push_bytes: usize,
    pub max_push_rows: usize,
    pub db_path: String,
    pub contract_tables: SyncContractTables,
    #[serde(skip)]
    pub transport: Option<Arc<dyn SyncHttpTransport>>,
    #[serde(default = "default_poll_interval")]
    pub poll_interval_secs: u64,
    #[serde(default)]
    pub poll_on_background: bool,
}

fn default_poll_interval() -> u64 {
    30
}
