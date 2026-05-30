use serde_json::json;
use serde_json::Value;

use crate::config::SyncEngineConfig;
use crate::cursor;
use crate::db::DbClient;
use crate::error::SyncError;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SyncStatusResult {
    pub changed_tables: Vec<String>,
    pub has_changes: bool,
    pub cursor: String,
    pub server_time: String,
}

pub async fn status(
    db: &DbClient,
    config: &SyncEngineConfig,
) -> Result<SyncStatusResult, SyncError> {
    let cursor_value = cursor::get_last_cursor(db, &config.scope_id)
        .await
        .map_err(SyncError::Database)?;

    let response = config
        .transport
        .send_status_request(
            config.api_url.clone(),
            json!({
                "scopeId": config.scope_id.clone(),
                "cursor": cursor_value,
            }),
        )
        .await?;

    Ok(parse_status_response(response))
}

fn parse_status_response(response: Value) -> SyncStatusResult {
    let changed_tables = response
        .get("changedTables")
        .and_then(Value::as_array)
        .map(|tables| {
            tables
                .iter()
                .filter_map(Value::as_str)
                .map(std::string::ToString::to_string)
                .collect()
        })
        .unwrap_or_default();

    let has_changes = response
        .get("hasChanges")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    let cursor = response
        .get("cursor")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    let server_time = response
        .get("serverTime")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    SyncStatusResult {
        changed_tables,
        has_changes,
        cursor,
        server_time,
    }
}
