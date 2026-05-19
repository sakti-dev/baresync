use serde::Serialize;
use serde_json::Value;
use sqlx::{
    sqlite::{
        SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteRow, SqliteSynchronous,
    },
    Column, Row, SqlitePool, TypeInfo,
};
use std::path::Path;
use std::str::FromStr;
use std::time::Duration;
use tokio::fs;

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
        let pool = connect_db(path.as_ref().to_str().unwrap_or_default()).await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS sync_client_identity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .map_err(|e| {
            SyncError::Database(format!(
                "Failed to create sync_client_identity table: {}",
                e
            ))
        })?;

        Ok(Self { pool })
    }
}

pub async fn connect_db(path: &str) -> Result<SqlitePool, SyncError> {
    let options = SqliteConnectOptions::from_str(&format!("sqlite:{}", path))
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

    Ok(pool)
}

pub fn sqlx_value_to_json(row: &SqliteRow, idx: usize) -> Value {
    let column = row.column(idx);
    let type_name = column.type_info().name();

    match type_name {
        "INTEGER" => {
            if let Ok(Some(v)) = row.try_get::<Option<i64>, _>(idx) {
                Value::from(v)
            } else if let Ok(Some(v)) = row.try_get::<Option<f64>, _>(idx) {
                Value::from(v)
            } else if let Ok(Some(v)) = row.try_get::<Option<String>, _>(idx) {
                Value::String(v)
            } else {
                Value::Null
            }
        }
        "REAL" => row
            .try_get::<Option<f64>, _>(idx)
            .map(|v| v.map(Value::from).unwrap_or(Value::Null))
            .unwrap_or(Value::Null),
        "TEXT" => row
            .try_get::<Option<String>, _>(idx)
            .map(|v| v.map(Value::String).unwrap_or(Value::Null))
            .unwrap_or(Value::Null),
        "BLOB" => row
            .try_get::<Option<Vec<u8>>, _>(idx)
            .map(|bytes| {
                bytes
                    .map(|bytes| Value::String(format!("{}B", bytes.len())))
                    .unwrap_or(Value::Null)
            })
            .unwrap_or(Value::Null),
        _ => {
            if let Ok(Some(v)) = row.try_get::<Option<i64>, _>(idx) {
                Value::from(v)
            } else if let Ok(Some(v)) = row.try_get::<Option<f64>, _>(idx) {
                Value::from(v)
            } else if let Ok(Some(v)) = row.try_get::<Option<String>, _>(idx) {
                Value::String(v)
            } else {
                Value::Null
            }
        }
    }
}

#[derive(Debug, Serialize)]
pub struct DbInfo {
    pub db_path: String,
    pub size_bytes: u64,
    pub size_formatted: String,
}

pub async fn get_db_info(path: impl AsRef<Path>) -> Result<DbInfo, SyncError> {
    let path = path.as_ref();
    let metadata = fs::metadata(path)
        .await
        .map_err(|e| SyncError::Database(format!("Failed to get DB file info: {}", e)))?;
    let size = metadata.len();
    Ok(DbInfo {
        db_path: path.display().to_string(),
        size_bytes: size,
        size_formatted: format_file_size(size),
    })
}

pub fn format_file_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = 1024 * KB;
    if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

pub async fn get_or_create_client_id(pool: &SqlitePool) -> Result<String, SyncError> {
    let existing: Option<String> =
        sqlx::query_scalar("SELECT client_id FROM sync_client_identity ORDER BY id LIMIT 1")
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

    sqlx::query("INSERT INTO sync_client_identity (client_id, created_at) VALUES (?1, ?2)")
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
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn sqlite_pool_uses_single_connection() {
        assert_eq!(SQLITE_POOL_MAX_CONNECTIONS, 1);
    }

    #[tokio::test]
    async fn connect_db_sets_wal_mode() {
        let dir = std::env::temp_dir().join(format!(
            "baresync-test-wal-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("test.db");
        let pool = connect_db(db_path.to_str().unwrap()).await.unwrap();

        let mode: String = sqlx::query_scalar("PRAGMA journal_mode")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(mode.to_lowercase(), "wal");

        let fk: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(fk, 1);

        pool.close().await;
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn get_db_info_returns_file_metadata() {
        let dir = std::env::temp_dir().join(format!(
            "baresync-test-dbinfo-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("info_test.db");
        let pool = connect_db(db_path.to_str().unwrap()).await.unwrap();
        sqlx::query("CREATE TABLE t (id INTEGER)")
            .execute(&pool)
            .await
            .unwrap();
        pool.close().await;

        let info = get_db_info(&db_path).await.unwrap();
        assert!(info.size_bytes > 0);
        assert!(info.size_formatted.contains("B"));
        assert!(info.db_path.contains("info_test.db"));

        std::fs::remove_dir_all(&dir).ok();
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
