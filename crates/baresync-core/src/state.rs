use crate::cursor;
use crate::db::DbClient;
use crate::error::SyncError;
use crate::outbox;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct LocalSyncState {
    pub local_dirty_count: i64,
    pub last_server_watermark: String,
    pub needs_baseline_sync: bool,
}

pub async fn get_sync_local_state(
    db: &DbClient,
    scope_id: &str,
) -> Result<LocalSyncState, SyncError> {
    let local_dirty_count = outbox::count_pending_outbox(db, scope_id)
        .await
        .map_err(SyncError::Database)?;

    let last_server_watermark = cursor::get_last_cursor(db, scope_id)
        .await
        .map_err(SyncError::Database)?;

    let needs_baseline_sync = last_server_watermark.is_empty();

    Ok(LocalSyncState {
        local_dirty_count,
        last_server_watermark,
        needs_baseline_sync,
    })
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

        db.execute(
            "CREATE TABLE IF NOT EXISTS sync_cursors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scope_id TEXT NOT NULL,
                last_cursor TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL
            )",
            vec![],
        )
        .await
        .unwrap();

        db
    }

    #[tokio::test]
    async fn get_sync_local_state_returns_defaults_when_empty() {
        let db = test_pool().await;
        let state = get_sync_local_state(&db, "scope-1").await.unwrap();
        assert_eq!(state.local_dirty_count, 0);
        assert!(state.last_server_watermark.is_empty());
        assert!(state.needs_baseline_sync);
    }

    #[tokio::test]
    async fn empty_cursor_means_needs_baseline_sync() {
        let db = test_pool().await;
        db.execute(
            "INSERT INTO sync_cursors (scope_id, last_cursor, updated_at) VALUES ('scope-1', '', '0')",
            vec![],
        )
        .await
        .unwrap();

        let state = get_sync_local_state(&db, "scope-1").await.unwrap();
        assert!(state.needs_baseline_sync);
        assert_eq!(state.last_server_watermark, "");
    }

    #[tokio::test]
    async fn get_sync_local_state_reflects_pending_and_cursor() {
        let db = test_pool().await;
        db.execute(
            "INSERT INTO sync_outbox (id, table_name, row_id, operation, payload, scope_id, changed_at, synced_at)
             VALUES ('o1', 'items', 'r1', 'insert', '{}', 'scope-1', '2026-01-01T00:00:00.000Z', NULL)",
            vec![],
        )
        .await
        .unwrap();

        db.execute(
            "INSERT INTO sync_cursors (scope_id, last_cursor, updated_at) VALUES ('scope-1', 'sync:abc123', '0')",
            vec![],
        )
        .await
        .unwrap();

        let state = get_sync_local_state(&db, "scope-1").await.unwrap();
        assert_eq!(state.local_dirty_count, 1);
        assert_eq!(state.last_server_watermark, "sync:abc123");
        assert!(!state.needs_baseline_sync);
    }
}
