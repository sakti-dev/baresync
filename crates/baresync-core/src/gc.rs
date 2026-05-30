use crate::db::DbClient;
use crate::error::SyncError;

pub async fn run_garbage_collection(
    db: &DbClient,
    tables: &[String],
    _scope_id: &str,
) -> Result<usize, SyncError> {
    let mut total_deleted = 0;
    for table in tables {
        let result = db
            .execute(
                &format!(
            "DELETE FROM {} WHERE deleted_at IS NOT NULL AND deleted_at != '' AND deleted_at != 'null' AND is_synced = 1",
                    table
                ),
                vec![],
            )
            .await
            .map_err(|e| SyncError::Database(format!("GC failed for {}: {}", table, e)))?;
        total_deleted += result.rows_affected as usize;
    }
    Ok(total_deleted)
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn test_pool() -> crate::db::DbClient {
        let db = crate::db::DbClient::connect(":memory:").await.unwrap();
        db.execute(
            "CREATE TABLE IF NOT EXISTS items (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                deleted_at TEXT,
                is_synced INTEGER NOT NULL DEFAULT 0
            )",
            vec![],
        )
        .await
        .unwrap();
        db
    }

    #[tokio::test]
    async fn gc_deletes_soft_deleted_synced_rows() {
        let db = test_pool().await;

        db.execute("INSERT INTO items (id, name, deleted_at, is_synced) VALUES ('1', 'gone', '2026-01-01', 1)", vec![])
            .await
            .unwrap();
        db.execute("INSERT INTO items (id, name, deleted_at, is_synced) VALUES ('2', 'stays-del', '2026-01-01', 0)", vec![])
            .await
            .unwrap();
        db.execute("INSERT INTO items (id, name, deleted_at, is_synced) VALUES ('3', 'stays-active', NULL, 1)", vec![])
            .await
            .unwrap();
        db.execute("INSERT INTO items (id, name, deleted_at, is_synced) VALUES ('4', 'stays-null-str', 'null', 1)", vec![])
            .await
            .unwrap();
        db.execute("INSERT INTO items (id, name, deleted_at, is_synced) VALUES ('5', 'stays-empty', '', 1)", vec![])
            .await
            .unwrap();

        let deleted = run_garbage_collection(&db, &["items".to_string()], "scope-1")
            .await
            .unwrap();
        assert_eq!(deleted, 1);

        let count = count_rows(&db, "SELECT COUNT(*) FROM items").await;
        assert_eq!(count, 4);
    }

    #[tokio::test]
    async fn gc_preserves_non_deleted_and_unsynced() {
        let db = test_pool().await;

        db.execute(
            "INSERT INTO items (id, name, deleted_at, is_synced) VALUES ('1', 'active', NULL, 0)",
            vec![],
        )
        .await
        .unwrap();
        db.execute("INSERT INTO items (id, name, deleted_at, is_synced) VALUES ('2', 'active-synced', NULL, 1)", vec![])
            .await
            .unwrap();
        db.execute("INSERT INTO items (id, name, deleted_at, is_synced) VALUES ('3', 'deleted-unsynced', '2026-01-01', 0)", vec![])
            .await
            .unwrap();

        let deleted = run_garbage_collection(&db, &["items".to_string()], "scope-1")
            .await
            .unwrap();
        assert_eq!(deleted, 0);

        let count = count_rows(&db, "SELECT COUNT(*) FROM items").await;
        assert_eq!(count, 3);
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
