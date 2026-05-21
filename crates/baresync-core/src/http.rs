use crate::error::{classify_http_error, SyncError};
use serde_json::Value;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

pub type SyncTransportFuture = Pin<Box<dyn Future<Output = Result<Value, SyncError>> + Send>>;

pub trait SyncHttpTransport: Send + Sync {
    fn send_push_request(&self, api_url: String, envelope: Value) -> SyncTransportFuture;

    fn send_status_request(&self, api_url: String, body: Value) -> SyncTransportFuture;

    fn send_pull_request(&self, api_url: String, body: Value) -> SyncTransportFuture;
}

#[derive(Debug, Default)]
pub struct JsonHttpTransport;

pub fn default_transport() -> Arc<dyn SyncHttpTransport> {
    Arc::new(JsonHttpTransport)
}

impl SyncHttpTransport for JsonHttpTransport {
    fn send_push_request(&self, api_url: String, envelope: Value) -> SyncTransportFuture {
        Box::pin(async move {
            let url = format!("{}/sync/push", api_url.trim_end_matches('/'));
            let client = reqwest::Client::new();
            let response = client
                .post(&url)
                .header("Content-Type", "application/json")
                .json(&envelope)
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
        })
    }

    fn send_status_request(&self, api_url: String, body: Value) -> SyncTransportFuture {
        Box::pin(async move {
            let url = format!("{}/sync/status", api_url.trim_end_matches('/'));
            let client = reqwest::Client::new();
            let response = client
                .post(&url)
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|e| SyncError::Network(format!("Status request failed: {}", e)))?;

            let status = response.status();
            let body = response
                .text()
                .await
                .map_err(|e| SyncError::Network(format!("Failed to read response body: {}", e)))?;

            if !status.is_success() {
                return Err(classify_http_error(status.as_u16(), &body));
            }

            serde_json::from_str(&body)
                .map_err(|e| SyncError::Encoding(format!("Failed to parse status response: {}", e)))
        })
    }

    fn send_pull_request(&self, api_url: String, body: Value) -> SyncTransportFuture {
        Box::pin(async move {
            let url = format!("{}/sync/pull", api_url.trim_end_matches('/'));
            let client = reqwest::Client::new();
            let response = client
                .post(&url)
                .header("Content-Type", "application/json")
                .json(&body)
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
        })
    }
}
