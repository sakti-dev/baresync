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

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS sync_client_identity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .map_err(|e| SyncError::Database(format!("Failed to create sync_client_identity table: {}", e)))?;

        Ok(Self { pool })
    }
}

pub async fn get_or_create_client_id(pool: &SqlitePool) -> Result<String, SyncError> {
    let existing: Option<String> = sqlx::query_scalar(
        "SELECT client_id FROM sync_client_identity ORDER BY id LIMIT 1",
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| SyncError::Database(format!("Failed to query client identity: {}", e)))?;

    if let Some(client_id) = existing {
        return Ok(client_id);
    }

    let client_id = uuid::Uuid::new_v4().to_string();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let created_at = format!("{}", now);

    sqlx::query(
        "INSERT INTO sync_client_identity (client_id, created_at) VALUES (?1, ?2)",
    )
    .bind(&client_id)
    .bind(&created_at)
    .execute(pool)
    .await
    .map_err(|e| SyncError::Database(format!("Failed to insert client identity: {}", e)))?;

    Ok(client_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sqlite_pool_uses_single_connection() {
        assert_eq!(SQLITE_POOL_MAX_CONNECTIONS, 1);
    }

    #[tokio::test]
    async fn get_or_create_client_id_generates_and_reuses() {
        let options = SqliteConnectOptions::from_str("sqlite::memory:")
            .unwrap()
            .pragma("foreign_keys", "ON");
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .unwrap();

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS sync_client_identity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .unwrap();

        let first = get_or_create_client_id(&pool).await.unwrap();
        let second = get_or_create_client_id(&pool).await.unwrap();
        assert_eq!(first, second);
        assert!(!first.is_empty());
    }
}
