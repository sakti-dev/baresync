use std::fmt;

#[derive(Debug)]
pub enum SyncError {
    Network(String),
    Validation(String),
    Database(String),
    Encoding(String),
    Migration(String),
    Http { status: u16, body: String, kind: String },
    SingleRowTooLarge { table: String, id: String },
}

impl fmt::Display for SyncError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Network(msg) => write!(f, "Network error: {}", msg),
            Self::Validation(msg) => write!(f, "Validation error: {}", msg),
            Self::Database(msg) => write!(f, "Database error: {}", msg),
            Self::Encoding(msg) => write!(f, "Encoding error: {}", msg),
            Self::Migration(msg) => write!(f, "Migration error: {}", msg),
            Self::Http { status, body, kind } => {
                write!(f, "HTTP error ({}): {} - {}", kind, status, body)
            }
            Self::SingleRowTooLarge { table, id } => {
                write!(f, "Single row too large: table={}, id={}", table, id)
            }
        }
    }
}

impl std::error::Error for SyncError {}

pub fn classify_http_error(status: u16, body: &str) -> SyncError {
    let kind = match status {
        401 | 403 => "auth",
        413 => "payload_too_large",
        500..=599 => "server",
        _ => "unknown",
    };
    SyncError::Http {
        status,
        body: body.to_string(),
        kind: kind.to_string(),
    }
}
