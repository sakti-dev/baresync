use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct LocalSyncState {
    pub local_dirty_count: i64,
    pub last_server_watermark: String,
    pub needs_baseline_sync: bool,
}
