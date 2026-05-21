use baresync_core::engine::SyncContractTables;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PluginConfig {
    pub api_base_url: String,
    pub encoding: String,
    pub max_push_bytes: usize,
    pub max_push_rows: usize,
    pub db_path: String,
    pub contract_tables: SyncContractTables,
    #[serde(default = "default_poll_interval")]
    pub poll_interval_secs: u64,
    #[serde(default)]
    pub poll_on_background: bool,
}

fn default_poll_interval() -> u64 {
    30
}
