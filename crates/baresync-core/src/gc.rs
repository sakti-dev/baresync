use sqlx::SqlitePool;

use crate::error::SyncError;

pub async fn run_garbage_collection(
    pool: &SqlitePool,
    tables: &[String],
    _scope_id: &str,
) -> Result<usize, SyncError> {
    let mut total_deleted = 0;
    for table in tables {
        let result = sqlx::query(&format!(
            "DELETE FROM {} WHERE deleted_at IS NOT NULL AND deleted_at != '' AND deleted_at != 'null' AND is_synced = 1",
            table
        ))
        .execute(pool)
        .await
        .map_err(|e| SyncError::Database(format!("GC failed for {}: {}", table, e)))?;
        total_deleted += result.rows_affected() as usize;
    }
    Ok(total_deleted)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use std::str::FromStr;

    async fn test_pool() -> SqlitePool {
        let options = SqliteConnectOptions::from_str("sqlite::memory:")
            .unwrap()
            .pragma("foreign_keys", "ON");
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .unwrap();

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS items (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                deleted_at TEXT,
                is_synced INTEGER NOT NULL DEFAULT 0
            )",
        )
        .execute(&pool)
        .await
        .unwrap();

        pool
    }

    #[tokio::test]
    async fn gc_deletes_soft_deleted_synced_rows() {
        let pool = test_pool().await;

        sqlx::query("INSERT INTO items (id, name, deleted_at, is_synced) VALUES ('1', 'gone', '2026-01-01', 1)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO items (id, name, deleted_at, is_synced) VALUES ('2', 'stays-del', '2026-01-01', 0)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO items (id, name, deleted_at, is_synced) VALUES ('3', 'stays-active', NULL, 1)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO items (id, name, deleted_at, is_synced) VALUES ('4', 'stays-null-str', 'null', 1)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO items (id, name, deleted_at, is_synced) VALUES ('5', 'stays-empty', '', 1)")
            .execute(&pool)
            .await
            .unwrap();

        let deleted = run_garbage_collection(&pool, &["items".to_string()], "scope-1")
            .await
            .unwrap();
        assert_eq!(deleted, 1);

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM items")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 4);
    }

    #[tokio::test]
    async fn gc_preserves_non_deleted_and_unsynced() {
        let pool = test_pool().await;

        sqlx::query(
            "INSERT INTO items (id, name, deleted_at, is_synced) VALUES ('1', 'active', NULL, 0)",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("INSERT INTO items (id, name, deleted_at, is_synced) VALUES ('2', 'active-synced', NULL, 1)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO items (id, name, deleted_at, is_synced) VALUES ('3', 'deleted-unsynced', '2026-01-01', 0)")
            .execute(&pool)
            .await
            .unwrap();

        let deleted = run_garbage_collection(&pool, &["items".to_string()], "scope-1")
            .await
            .unwrap();
        assert_eq!(deleted, 0);

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM items")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 3);
    }
}
