use crate::http::{default_transport, SyncHttpTransport};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Clone, Deserialize, Serialize)]
pub struct SyncEngineConfig {
    pub scope_id: String,
    pub api_url: String,
    pub client_id: String,
    pub target_push_bytes: usize,
    pub max_push_bytes: usize,
    pub max_push_rows: usize,
    #[serde(skip, default = "default_transport")]
    pub transport: Arc<dyn SyncHttpTransport>,
}

impl Default for SyncEngineConfig {
    fn default() -> Self {
        Self {
            scope_id: String::new(),
            api_url: String::new(),
            client_id: String::new(),
            target_push_bytes: 256 * 1024,
            max_push_bytes: 2 * 1024 * 1024,
            max_push_rows: 2000,
            transport: default_transport(),
        }
    }
}
