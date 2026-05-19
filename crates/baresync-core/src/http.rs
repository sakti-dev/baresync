use crate::error::{classify_http_error, SyncError};
use serde_json::Value;

pub async fn send_push_request(
    api_url: &str,
    envelope: &Value,
) -> Result<Value, SyncError> {
    let url = format!("{}/sync/push", api_url.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(envelope)
        .send()
        .await
        .map_err(|e| SyncError::Network(format!("Push request failed: {}", e)))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| SyncError::Network(format!("Failed to read response body: {}", e)))?;

    if !status.is_success() {
        return Err(classify_http_error(status.as_u16(), &body));
    }

    serde_json::from_str(&body)
        .map_err(|e| SyncError::Encoding(format!("Failed to parse push response: {}", e)))
}

pub async fn send_pull_request(
    api_url: &str,
    scope_id: &str,
    tables: &[String],
    limit: i32,
    cursor: &str,
) -> Result<Value, SyncError> {
    let url = format!("{}/sync/pull", api_url.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .query(&[
            ("scopeId", scope_id),
            ("tables", &tables.join(",")),
            ("limit", &limit.to_string()),
            ("cursor", cursor),
        ])
        .send()
        .await
        .map_err(|e| SyncError::Network(format!("Pull request failed: {}", e)))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| SyncError::Network(format!("Failed to read response body: {}", e)))?;

    if !status.is_success() {
        return Err(classify_http_error(status.as_u16(), &body));
    }

    serde_json::from_str(&body)
        .map_err(|e| SyncError::Encoding(format!("Failed to parse pull response: {}", e)))
}
