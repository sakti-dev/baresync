use crate::error::{classify_http_error, SyncError};
use crate::headers::SyncRequestHeaders;
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

#[derive(Debug, Clone)]
pub struct JsonHttpTransport {
    custom_headers: SyncRequestHeaders,
}

impl JsonHttpTransport {
    /// Create a new transport with no custom headers.
    pub fn new() -> Self {
        Self {
            custom_headers: SyncRequestHeaders::new(),
        }
    }

    /// Create a transport that shares the given custom header store.
    pub fn with_headers(custom_headers: SyncRequestHeaders) -> Self {
        Self { custom_headers }
    }
}

impl Default for JsonHttpTransport {
    fn default() -> Self {
        Self::new()
    }
}

pub fn default_transport() -> Arc<dyn SyncHttpTransport> {
    Arc::new(JsonHttpTransport::new())
}

/// Create a transport with a shared custom header store.
pub fn transport_with_headers(headers: SyncRequestHeaders) -> Arc<dyn SyncHttpTransport> {
    Arc::new(JsonHttpTransport::with_headers(headers))
}

impl SyncHttpTransport for JsonHttpTransport {
    fn send_push_request(&self, api_url: String, envelope: Value) -> SyncTransportFuture {
        let custom = self.custom_headers.snapshot();
        Box::pin(async move {
            let url = format!("{}/push", api_url.trim_end_matches('/'));
            log::debug!("[baresync] HTTP POST {}", url);
            let client = reqwest::Client::new();
            let mut request = client
                .post(&url)
                .header("Content-Type", "application/json")
                .json(&envelope);
            for (name, value) in custom.iter() {
                request = request.header(name.clone(), value.clone());
            }
            let response = request
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
        let custom = self.custom_headers.snapshot();
        Box::pin(async move {
            let url = format!("{}/status", api_url.trim_end_matches('/'));
            log::debug!("[baresync] HTTP POST {}", url);
            let client = reqwest::Client::new();
            let mut request = client
                .post(&url)
                .header("Content-Type", "application/json")
                .json(&body);
            for (name, value) in custom.iter() {
                request = request.header(name.clone(), value.clone());
            }
            let response = request
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
        let custom = self.custom_headers.snapshot();
        Box::pin(async move {
            let url = format!("{}/pull", api_url.trim_end_matches('/'));
            log::debug!("[baresync] HTTP POST {}", url);
            let client = reqwest::Client::new();
            let mut request = client
                .post(&url)
                .header("Content-Type", "application/json")
                .json(&body);
            for (name, value) in custom.iter() {
                request = request.header(name.clone(), value.clone());
            }
            let response = request
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::collections::HashMap;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    #[derive(Debug)]
    struct CapturedRequest {
        path: String,
        headers: HashMap<String, String>,
        body: String,
    }

    async fn capture_single_request(
        transport: JsonHttpTransport,
        path: &str,
        body: Value,
    ) -> CapturedRequest {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let server = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut buffer = Vec::new();
            let header_end = loop {
                let mut chunk = [0_u8; 1024];
                let read = stream.read(&mut chunk).await.unwrap();
                assert!(read > 0, "client closed connection before sending request");
                buffer.extend_from_slice(&chunk[..read]);
                if let Some(index) = buffer.windows(4).position(|window| window == b"\r\n\r\n") {
                    break index + 4;
                }
            };

            let header_text = String::from_utf8(buffer[..header_end].to_vec()).unwrap();
            let mut lines = header_text.split("\r\n");
            let request_line = lines.next().unwrap();
            let request_path = request_line.split_whitespace().nth(1).unwrap().to_string();
            let mut headers = HashMap::new();
            let mut content_length = 0_usize;

            for line in lines.filter(|line| !line.is_empty()) {
                if let Some((name, value)) = line.split_once(": ") {
                    headers.insert(name.to_ascii_lowercase(), value.to_string());
                    if name.eq_ignore_ascii_case("content-length") {
                        content_length = value.parse().unwrap();
                    }
                }
            }

            let mut request_body = buffer[header_end..].to_vec();
            while request_body.len() < content_length {
                let mut chunk = [0_u8; 1024];
                let read = stream.read(&mut chunk).await.unwrap();
                assert!(read > 0, "client closed connection before sending full body");
                request_body.extend_from_slice(&chunk[..read]);
            }

            let response_body = r#"{"ok":true}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                response_body.len(),
                response_body
            );
            stream.write_all(response.as_bytes()).await.unwrap();

            CapturedRequest {
                path: request_path,
                headers,
                body: String::from_utf8(request_body).unwrap(),
            }
        });

        let api_url = format!("http://{}", addr);
        let _captured = match path {
            "/status" => transport.send_status_request(api_url, body).await.unwrap(),
            "/pull" => transport.send_pull_request(api_url, body).await.unwrap(),
            "/push" => transport.send_push_request(api_url, body).await.unwrap(),
            _ => unreachable!("unexpected path"),
        };

        server.await.unwrap()
    }

    #[tokio::test]
    async fn status_request_includes_custom_headers() {
        let transport = JsonHttpTransport::with_headers(
            SyncRequestHeaders::with_headers(&[
                ("Authorization".to_string(), "Bearer token-1".to_string()),
                ("X-Api-Key".to_string(), "key-1".to_string()),
            ])
            .unwrap(),
        );

        let captured =
            capture_single_request(transport, "/status", json!({"scopeId":"scope-1"})).await;
        assert_eq!(captured.path, "/status");
        assert_eq!(
            captured.headers.get("authorization"),
            Some(&"Bearer token-1".to_string())
        );
        assert_eq!(captured.headers.get("x-api-key"), Some(&"key-1".to_string()));
        assert_eq!(
            captured.headers.get("content-type"),
            Some(&"application/json".to_string())
        );
        assert!(captured.body.contains("\"scopeId\":\"scope-1\""));
    }

    #[tokio::test]
    async fn pull_request_includes_custom_headers() {
        let transport = JsonHttpTransport::with_headers(
            SyncRequestHeaders::with_headers(&[(
                "Authorization".to_string(),
                "Bearer token-2".to_string(),
            )])
            .unwrap(),
        );

        let captured =
            capture_single_request(transport, "/pull", json!({"scopeId":"scope-1"})).await;
        assert_eq!(captured.path, "/pull");
        assert_eq!(
            captured.headers.get("authorization"),
            Some(&"Bearer token-2".to_string())
        );
        assert_eq!(
            captured.headers.get("content-type"),
            Some(&"application/json".to_string())
        );
    }

    #[tokio::test]
    async fn push_request_includes_custom_headers() {
        let transport = JsonHttpTransport::with_headers(
            SyncRequestHeaders::with_headers(&[(
                "X-Api-Key".to_string(),
                "static-key".to_string(),
            )])
            .unwrap(),
        );

        let captured = capture_single_request(transport, "/push", json!({"envelope":true})).await;
        assert_eq!(captured.path, "/push");
        assert_eq!(
            captured.headers.get("x-api-key"),
            Some(&"static-key".to_string())
        );
        assert_eq!(
            captured.headers.get("content-type"),
            Some(&"application/json".to_string())
        );
    }
}
