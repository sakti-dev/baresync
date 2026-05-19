use sqlx::{QueryBuilder, Sqlite, SqliteConnection, SqlitePool};

use crate::error::SyncError;

pub async fn count_pending_outbox(pool: &SqlitePool, scope_id: &str) -> Result<i64, String> {
    let query = "SELECT COUNT(*) FROM sync_outbox WHERE synced_at IS NULL AND scope_id = ?1";
    sqlx::query_scalar::<_, i64>(query)
        .bind(scope_id)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Failed to count sync outbox: {}", e))
}

pub async fn mark_outbox_synced_by_outbox_ids_tx(
    conn: &mut SqliteConnection,
    synced_at: &str,
    outbox_ids: &[String],
) -> Result<u64, String> {
    if outbox_ids.is_empty() {
        return Ok(0);
    }

    let mut builder: QueryBuilder<Sqlite> =
        QueryBuilder::new("UPDATE sync_outbox SET synced_at = ");
    builder
        .push_bind(synced_at)
        .push(" WHERE synced_at IS NULL AND id IN (");
    let mut separated = builder.separated(", ");
    for id in outbox_ids {
        separated.push_bind(id);
    }
    separated.push_unseparated(")");

    let result = builder
        .build()
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("Failed to mark sync outbox rows synced by id: {}", e))?;

    Ok(result.rows_affected())
}

pub async fn purge_synced_outbox(pool: &SqlitePool, older_than: &str) -> Result<u64, SyncError> {
    let result = sqlx::query(
        "DELETE FROM sync_outbox WHERE synced_at IS NOT NULL AND synced_at < ?",
    )
    .bind(older_than)
    .execute(pool)
    .await
    .map_err(|e| SyncError::Database(format!("Failed to purge synced outbox: {}", e)))?;
    Ok(result.rows_affected())
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
            "CREATE TABLE IF NOT EXISTS sync_outbox (
                id TEXT PRIMARY KEY,
                table_name TEXT NOT NULL,
                row_id TEXT NOT NULL,
                operation TEXT NOT NULL,
                payload TEXT,
                scope_id TEXT NOT NULL,
                changed_at TEXT NOT NULL,
                synced_at TEXT
            )",
        )
        .execute(&pool)
        .await
        .unwrap();

        pool
    }

    #[tokio::test]
    async fn purge_deletes_old_synced_entries() {
        let pool = test_pool().await;

        sqlx::query(
            "INSERT INTO sync_outbox (id, table_name, row_id, operation, payload, scope_id, changed_at, synced_at)
             VALUES ('o1', 'items', 'r1', 'insert', '{}', 's1', '2026-01-01', '2026-01-02')",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO sync_outbox (id, table_name, row_id, operation, payload, scope_id, changed_at, synced_at)
             VALUES ('o2', 'items', 'r2', 'insert', '{}', 's1', '2026-02-01', '2026-02-02')",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO sync_outbox (id, table_name, row_id, operation, payload, scope_id, changed_at, synced_at)
             VALUES ('o3', 'items', 'r3', 'insert', '{}', 's1', '2026-03-01', NULL)",
        )
        .execute(&pool)
        .await
        .unwrap();

        let purged = purge_synced_outbox(&pool, "2026-02-01").await.unwrap();
        assert_eq!(purged, 1);

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sync_outbox")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 2);
    }

    #[tokio::test]
    async fn purge_preserves_recent_synced_entries() {
        let pool = test_pool().await;

        sqlx::query(
            "INSERT INTO sync_outbox (id, table_name, row_id, operation, payload, scope_id, changed_at, synced_at)
             VALUES ('o1', 'items', 'r1', 'insert', '{}', 's1', '2026-03-01', '2026-03-02')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let purged = purge_synced_outbox(&pool, "2026-01-01").await.unwrap();
        assert_eq!(purged, 0);

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sync_outbox")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 1);
    }
}
