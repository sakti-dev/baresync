use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE};
use std::sync::{Arc, RwLock};

/// Thread-safe shared store for custom sync request headers.
///
/// Multiple writers (JS command, Rust host, builder) can update headers.
/// The transport snapshots headers before building each HTTP request.
#[derive(Clone, Debug)]
pub struct SyncRequestHeaders {
    inner: Arc<RwLock<HeaderMap>>,
}

impl SyncRequestHeaders {
    /// Create an empty header store.
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(HeaderMap::new())),
        }
    }

    /// Create a header store seeded with initial headers.
    ///
    /// Returns an error if any header name or value is invalid,
    /// or if `Content-Type` is included (reserved by the transport).
    pub fn with_headers(headers: &[(String, String)]) -> Result<Self, HeaderValidationError> {
        let store = Self::new();
        store.replace(headers)?;
        Ok(store)
    }

    /// Replace all custom headers with the provided set.
    ///
    /// Returns an error if any header name or value is invalid,
    /// or if `Content-Type` is included (reserved by the transport).
    ///
    /// On error, the existing header set is preserved (atomic replacement).
    pub fn replace(&self, headers: &[(String, String)]) -> Result<(), HeaderValidationError> {
        let validated = validate_headers(headers)?;
        let mut map = self.inner.write().map_err(|_| HeaderValidationError::LockError)?;
        map.clear();
        for (name, value) in validated {
            map.insert(name, value);
        }
        Ok(())
    }

    /// Snapshot the current custom headers.
    ///
    /// The returned `HeaderMap` is a clone and will not reflect later updates.
    pub fn snapshot(&self) -> HeaderMap {
        self.inner
            .read()
            .map(|map| map.clone())
            .unwrap_or_default()
    }
}

impl Default for SyncRequestHeaders {
    fn default() -> Self {
        Self::new()
    }
}

/// Errors returned when validating custom sync request headers.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HeaderValidationError {
    /// The header name is empty or not a valid HTTP header name.
    InvalidName(String),
    /// The header value contains invalid characters (e.g., newlines).
    InvalidValue(String),
    /// `Content-Type` is reserved by the JSON transport.
    ReservedContentType,
    /// Failed to acquire the internal lock.
    LockError,
}

impl std::fmt::Display for HeaderValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            HeaderValidationError::InvalidName(name) => {
                write!(f, "invalid header name: '{}'", name)
            }
            HeaderValidationError::InvalidValue(_) => {
                write!(f, "invalid header value")
            }
            HeaderValidationError::ReservedContentType => {
                write!(
                    f,
                    "Content-Type is reserved by the JSON transport and cannot be set as a custom header"
                )
            }
            HeaderValidationError::LockError => {
                write!(f, "failed to acquire header store lock")
            }
        }
    }
}

impl std::error::Error for HeaderValidationError {}

/// Validate header names and values using HTTP parsing types.
///
/// Returns the validated pairs as `(HeaderName, HeaderValue)`.
/// Rejects empty names, invalid names/values, and `Content-Type`.
fn validate_headers(
    headers: &[(String, String)],
) -> Result<Vec<(HeaderName, HeaderValue)>, HeaderValidationError> {
    let mut validated = Vec::with_capacity(headers.len());

    for (name, value) in headers {
        let header_name: HeaderName = name
            .parse()
            .map_err(|_| HeaderValidationError::InvalidName(name.clone()))?;

        if header_name == CONTENT_TYPE {
            return Err(HeaderValidationError::ReservedContentType);
        }

        let header_value: HeaderValue = value
            .parse()
            .map_err(|_| HeaderValidationError::InvalidValue("***".to_string()))?;

        validated.push((header_name, header_value));
    }

    Ok(validated)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_store_has_empty_headers() {
        let store = SyncRequestHeaders::new();
        let snapshot = store.snapshot();
        assert!(snapshot.is_empty());
    }

    #[test]
    fn replace_stores_headers() {
        let store = SyncRequestHeaders::new();
        store
            .replace(&[
                ("Authorization".to_string(), "Bearer token-1".to_string()),
                ("X-Api-Key".to_string(), "key-1".to_string()),
            ])
            .unwrap();

        let snapshot = store.snapshot();
        assert_eq!(
            snapshot.get("authorization").unwrap(),
            "Bearer token-1"
        );
        assert_eq!(snapshot.get("x-api-key").unwrap(), "key-1");
    }

    #[test]
    fn replace_clears_previous_headers() {
        let store = SyncRequestHeaders::new();
        store
            .replace(&[("Authorization".to_string(), "Bearer old".to_string())])
            .unwrap();

        store
            .replace(&[("X-Api-Key".to_string(), "new-key".to_string())])
            .unwrap();

        let snapshot = store.snapshot();
        assert!(snapshot.get("authorization").is_none());
        assert_eq!(snapshot.get("x-api-key").unwrap(), "new-key");
    }

    #[test]
    fn empty_replace_clears_all_headers() {
        let store = SyncRequestHeaders::new();
        store
            .replace(&[("Authorization".to_string(), "Bearer token".to_string())])
            .unwrap();

        store.replace(&[]).unwrap();

        let snapshot = store.snapshot();
        assert!(snapshot.is_empty());
    }

    #[test]
    fn replace_rejects_invalid_header_name() {
        let store = SyncRequestHeaders::new();
        let result = store.replace(&[("Invalid Name!".to_string(), "value".to_string())]);
        assert!(matches!(result, Err(HeaderValidationError::InvalidName(_))));
    }

    #[test]
    fn replace_rejects_empty_header_name() {
        let store = SyncRequestHeaders::new();
        let result = store.replace(&[("".to_string(), "value".to_string())]);
        assert!(matches!(result, Err(HeaderValidationError::InvalidName(_))));
    }

    #[test]
    fn replace_rejects_invalid_header_value() {
        let store = SyncRequestHeaders::new();
        let result = store.replace(&[(
            "X-Test".to_string(),
            "value\nwith\nnewlines".to_string(),
        )]);
        assert!(matches!(
            result,
            Err(HeaderValidationError::InvalidValue(_))
        ));
    }

    #[test]
    fn replace_rejects_content_type() {
        let store = SyncRequestHeaders::new();
        let result = store.replace(&[(
            "Content-Type".to_string(),
            "text/plain".to_string(),
        )]);
        assert_eq!(result, Err(HeaderValidationError::ReservedContentType));
    }

    #[test]
    fn replace_rejects_content_type_case_insensitive() {
        let store = SyncRequestHeaders::new();
        let result = store.replace(&[(
            "content-type".to_string(),
            "text/plain".to_string(),
        )]);
        assert_eq!(result, Err(HeaderValidationError::ReservedContentType));
    }

    #[test]
    fn replace_preserves_existing_on_validation_error() {
        let store = SyncRequestHeaders::new();
        store
            .replace(&[("Authorization".to_string(), "Bearer valid".to_string())])
            .unwrap();

        let result = store.replace(&[("Invalid Name!".to_string(), "value".to_string())]);
        assert!(result.is_err());

        let snapshot = store.snapshot();
        assert_eq!(snapshot.get("authorization").unwrap(), "Bearer valid");
    }

    #[test]
    fn with_headers_seeds_initial_headers() {
        let store = SyncRequestHeaders::with_headers(&[(
            "X-Api-Key".to_string(),
            "static-key".to_string(),
        )])
        .unwrap();

        let snapshot = store.snapshot();
        assert_eq!(snapshot.get("x-api-key").unwrap(), "static-key");
    }

    #[test]
    fn with_headers_rejects_invalid_headers() {
        let result = SyncRequestHeaders::with_headers(&[(
            "Content-Type".to_string(),
            "text/plain".to_string(),
        )]);
        assert!(result.is_err());
    }

    #[test]
    fn snapshot_is_independent_of_later_updates() {
        let store = SyncRequestHeaders::new();
        store
            .replace(&[("Authorization".to_string(), "Bearer old".to_string())])
            .unwrap();

        let snapshot = store.snapshot();

        store
            .replace(&[("Authorization".to_string(), "Bearer new".to_string())])
            .unwrap();

        assert_eq!(snapshot.get("authorization").unwrap(), "Bearer old");
        assert_eq!(store.snapshot().get("authorization").unwrap(), "Bearer new");
    }
}
