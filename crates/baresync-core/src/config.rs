use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SyncEngineConfig {
    pub scope_id: String,
    pub api_url: String,
    pub client_id: String,
    pub encoding: String,
    pub target_push_bytes: usize,
    pub max_push_bytes: usize,
    pub max_push_rows: usize,
}

impl Default for SyncEngineConfig {
    fn default() -> Self {
        Self {
            scope_id: String::new(),
            api_url: String::new(),
            client_id: String::new(),
            encoding: "json".to_string(),
            target_push_bytes: 256 * 1024,
            max_push_bytes: 2 * 1024 * 1024,
            max_push_rows: 2000,
        }
    }
}
