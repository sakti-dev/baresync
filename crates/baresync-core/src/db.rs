use sqlx::{
    sqlite::{
        SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous,
    },
    SqlitePool,
};
use std::str::FromStr;
use std::time::Duration;

use crate::error::SyncError;

const SQLITE_POOL_MAX_CONNECTIONS: u32 = 1;

pub struct LocalDatabase {
    pool: SqlitePool,
}

impl LocalDatabase {
    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    pub async fn connect(path: impl AsRef<std::path::Path>) -> Result<Self, SyncError> {
        let path_str = path.as_ref().display().to_string();
        let options = SqliteConnectOptions::from_str(&format!("sqlite:{}", path_str))
            .map_err(|e| SyncError::Database(format!("Invalid DB URI: {}", e)))?
            .create_if_missing(true)
            .journal_mode(SqliteJournalMode::Wal)
            .synchronous(SqliteSynchronous::Normal)
            .busy_timeout(Duration::from_secs(5))
            .pragma("foreign_keys", "ON");

        let pool = SqlitePoolOptions::new()
            .max_connections(SQLITE_POOL_MAX_CONNECTIONS)
            .acquire_timeout(Duration::from_secs(3))
            .connect_with(options)
            .await
            .map_err(|e| SyncError::Database(format!("Failed to connect to DB: {}", e)))?;

        Ok(Self { pool })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sqlite_pool_uses_single_connection() {
        assert_eq!(SQLITE_POOL_MAX_CONNECTIONS, 1);
    }
}
