use sqlx::{QueryBuilder, Sqlite, SqliteConnection, SqlitePool};

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
