use sqlx::{SqliteConnection, SqlitePool};

pub async fn get_last_cursor(pool: &SqlitePool, scope_id: &str) -> Result<String, String> {
    let query =
        "SELECT last_cursor FROM sync_cursors WHERE scope_id = ?1 ORDER BY updated_at DESC LIMIT 1";
    let value = sqlx::query_scalar::<_, Option<String>>(query)
        .bind(scope_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to get sync cursor: {}", e))?;
    Ok(value.flatten().unwrap_or_default())
}

pub async fn set_last_cursor_tx(
    conn: &mut SqliteConnection,
    scope_id: &str,
    cursor: &str,
) -> Result<(), String> {
    let now = current_time_millis_string();
    let existing = sqlx::query_scalar::<_, Option<String>>(
        "SELECT last_cursor FROM sync_cursors WHERE scope_id = ?1 LIMIT 1",
    )
    .bind(scope_id)
    .fetch_optional(&mut *conn)
    .await
    .map_err(|e| format!("Failed to read sync cursor: {}", e))?;

    if existing.is_some() {
        sqlx::query(
            "UPDATE sync_cursors SET last_cursor = ?2, updated_at = ?3 WHERE scope_id = ?1",
        )
        .bind(scope_id)
        .bind(cursor)
        .bind(&now)
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("Failed to update sync cursor: {}", e))?;
    } else {
        sqlx::query(
            "INSERT INTO sync_cursors (scope_id, last_cursor, updated_at) VALUES (?1, ?2, ?3)",
        )
        .bind(scope_id)
        .bind(cursor)
        .bind(&now)
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("Failed to insert sync cursor: {}", e))?;
    }

    Ok(())
}

fn current_time_millis_string() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .to_string()
}
