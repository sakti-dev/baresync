use baresync_core::engine::SyncContractTables;
use serde::{Deserialize, Serialize};

#[derive(Clone, Deserialize, Serialize)]
#[serde(default)]
pub struct PluginConfig {
    pub api_base_url: String,
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

impl Default for PluginConfig {
    fn default() -> Self {
        Self {
            api_base_url: String::new(),
            max_push_bytes: 2 * 1024 * 1024,
            max_push_rows: 2000,
            db_path: String::new(),
            contract_tables: SyncContractTables {
                upsert_order: vec![],
                delete_order: vec![],
                local_only_columns: vec![],
            },
            poll_interval_secs: default_poll_interval(),
            poll_on_background: false,
        }
    }
}
