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
            let url = format!("{}/push", api_url.trim_end_matches('/'));
            log::debug!("[baresync] HTTP POST {}", url);
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
                log::error!("[baresync] HTTP POST {} -> {} {}", url, status.as_u16(), &body[..body.len().min(200)]);
                return Err(classify_http_error(status.as_u16(), &body));
            }

            log::debug!("[baresync] HTTP POST {} -> {}", url, status.as_u16());
            serde_json::from_str(&body)
                .map_err(|e| SyncError::JsonParse(format!("Failed to parse push response: {}", e)))
        })
    }

    fn send_status_request(&self, api_url: String, body: Value) -> SyncTransportFuture {
        Box::pin(async move {
            let url = format!("{}/status", api_url.trim_end_matches('/'));
            log::debug!("[baresync] HTTP POST {}", url);
            let client = reqwest::Client::new();
            let response = client
                .post(&url)
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|e| SyncError::Network(format!("Status request failed: {}", e)))?;

            let status = response.status();
            let resp_body = response
                .text()
                .await
                .map_err(|e| SyncError::Network(format!("Failed to read response body: {}", e)))?;

            if !status.is_success() {
                log::error!("[baresync] HTTP POST {} -> {} {}", url, status.as_u16(), &resp_body[..resp_body.len().min(200)]);
                return Err(classify_http_error(status.as_u16(), &resp_body));
            }

            log::debug!("[baresync] HTTP POST {} -> {}", url, status.as_u16());
            serde_json::from_str(&resp_body)
                .map_err(|e| SyncError::JsonParse(format!("Failed to parse status response: {}", e)))
        })
    }

    fn send_pull_request(&self, api_url: String, body: Value) -> SyncTransportFuture {
        Box::pin(async move {
            let url = format!("{}/pull", api_url.trim_end_matches('/'));
            log::debug!("[baresync] HTTP POST {}", url);
            let client = reqwest::Client::new();
            let response = client
                .post(&url)
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|e| SyncError::Network(format!("Pull request failed: {}", e)))?;

            let status = response.status();
            let resp_body = response
                .text()
                .await
                .map_err(|e| SyncError::Network(format!("Failed to read response body: {}", e)))?;

            if !status.is_success() {
                log::error!("[baresync] HTTP POST {} -> {} {}", url, status.as_u16(), &resp_body[..resp_body.len().min(200)]);
                return Err(classify_http_error(status.as_u16(), &resp_body));
            }

            log::debug!("[baresync] HTTP POST {} -> {}", url, status.as_u16());
            serde_json::from_str(&resp_body)
                .map_err(|e| SyncError::JsonParse(format!("Failed to parse pull response: {}", e)))
        })
    }
}
