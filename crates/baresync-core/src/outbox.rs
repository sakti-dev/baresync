use crate::db::DbClient;
use crate::error::SyncError;

pub async fn count_pending_outbox(db: &DbClient, scope_id: &str) -> Result<i64, String> {
    let query = "SELECT COUNT(*) FROM sync_outbox WHERE synced_at IS NULL AND scope_id = ?1";
    let rows = db
        .query(query, vec![serde_json::Value::String(scope_id.to_string())])
        .await
        .map_err(|e| format!("Failed to count sync outbox: {}", e))?;
    Ok(rows
        .first()
        .and_then(|row| row.values.first())
        .and_then(|value| value.as_i64())
        .unwrap_or(0))
}

pub async fn mark_outbox_synced_by_outbox_ids_tx(
    db: &DbClient,
    synced_at: &str,
    outbox_ids: &[String],
) -> Result<u64, String> {
    if outbox_ids.is_empty() {
        return Ok(0);
    }

    let placeholders = outbox_ids
        .iter()
        .map(|_| "?")
        .collect::<Vec<_>>()
        .join(", ");
    let mut params = vec![serde_json::Value::String(synced_at.to_string())];
    params.extend(outbox_ids.iter().cloned().map(serde_json::Value::String));
    let result = db
        .execute(
            format!(
                "UPDATE sync_outbox SET synced_at = ?1 WHERE synced_at IS NULL AND id IN ({})",
                placeholders
            ),
            params,
        )
        .await
        .map_err(|e| format!("Failed to mark sync outbox rows synced by id: {}", e))?;

    Ok(result.rows_affected)
}

pub async fn purge_synced_outbox(db: &DbClient, older_than: &str) -> Result<u64, SyncError> {
    let result = db
        .execute(
            "DELETE FROM sync_outbox WHERE synced_at IS NOT NULL AND synced_at < ?",
            vec![serde_json::Value::String(older_than.to_string())],
        )
        .await
        .map_err(|e| SyncError::Database(format!("Failed to purge synced outbox: {}", e)))?;
    Ok(result.rows_affected)
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn test_pool() -> crate::db::DbClient {
        let db = crate::db::DbClient::connect(":memory:").await.unwrap();
        db.execute(
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
            vec![],
        )
        .await
        .unwrap();
        db
    }

    #[tokio::test]
    async fn purge_deletes_old_synced_entries() {
        let db = test_pool().await;

        db.execute("INSERT INTO sync_outbox (id, table_name, row_id, operation, payload, scope_id, changed_at, synced_at)
             VALUES ('o1', 'items', 'r1', 'insert', '{}', 's1', '2026-01-01', '2026-01-02')", vec![])
        .await.unwrap();
        db.execute("INSERT INTO sync_outbox (id, table_name, row_id, operation, payload, scope_id, changed_at, synced_at)
             VALUES ('o2', 'items', 'r2', 'insert', '{}', 's1', '2026-02-01', '2026-02-02')", vec![])
        .await.unwrap();
        db.execute("INSERT INTO sync_outbox (id, table_name, row_id, operation, payload, scope_id, changed_at, synced_at)
             VALUES ('o3', 'items', 'r3', 'insert', '{}', 's1', '2026-03-01', NULL)", vec![])
        .await.unwrap();

        let purged = purge_synced_outbox(&db, "2026-02-01").await.unwrap();
        assert_eq!(purged, 1);

        let count = count_rows(&db, "SELECT COUNT(*) FROM sync_outbox").await;
        assert_eq!(count, 2);
    }

    #[tokio::test]
    async fn purge_preserves_recent_synced_entries() {
        let db = test_pool().await;

        db.execute("INSERT INTO sync_outbox (id, table_name, row_id, operation, payload, scope_id, changed_at, synced_at)
             VALUES ('o1', 'items', 'r1', 'insert', '{}', 's1', '2026-03-01', '2026-03-02')", vec![])
        .await.unwrap();

        let purged = purge_synced_outbox(&db, "2026-01-01").await.unwrap();
        assert_eq!(purged, 0);

        let count = count_rows(&db, "SELECT COUNT(*) FROM sync_outbox").await;
        assert_eq!(count, 1);
    }

    async fn count_rows(db: &crate::db::DbClient, sql: &str) -> i64 {
        db.query(sql, vec![])
            .await
            .unwrap()
            .first()
            .and_then(|row| row.values.first())
            .and_then(|value| value.as_i64())
            .unwrap_or_default()
    }
}
