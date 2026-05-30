use crate::db::DbClient;
use crate::db::DbRow;

pub async fn get_last_cursor(db: &DbClient, scope_id: &str) -> Result<String, String> {
    let query =
        "SELECT last_cursor FROM sync_cursors WHERE scope_id = ?1 ORDER BY updated_at DESC LIMIT 1";
    let rows = db
        .query(query, vec![serde_json::Value::String(scope_id.to_string())])
        .await
        .map_err(|e| format!("Failed to get sync cursor: {}", e))?;
    Ok(extract_first_string(rows).unwrap_or_default())
}

pub async fn set_last_cursor_tx(db: &DbClient, scope_id: &str, cursor: &str) -> Result<(), String> {
    let now = current_time_millis_string();
    let existing = db
        .query(
            "SELECT last_cursor FROM sync_cursors WHERE scope_id = ?1 LIMIT 1",
            vec![serde_json::Value::String(scope_id.to_string())],
        )
        .await
        .map_err(|e| format!("Failed to read sync cursor: {}", e))?;

    if !existing.is_empty() {
        db.execute(
            "UPDATE sync_cursors SET last_cursor = ?2, updated_at = ?3 WHERE scope_id = ?1",
            vec![
                serde_json::Value::String(scope_id.to_string()),
                serde_json::Value::String(cursor.to_string()),
                serde_json::Value::String(now),
            ],
        )
        .await
        .map_err(|e| format!("Failed to update sync cursor: {}", e))?;
    } else {
        db.execute(
            "INSERT INTO sync_cursors (scope_id, last_cursor, updated_at) VALUES (?1, ?2, ?3)",
            vec![
                serde_json::Value::String(scope_id.to_string()),
                serde_json::Value::String(cursor.to_string()),
                serde_json::Value::String(now),
            ],
        )
        .await
        .map_err(|e| format!("Failed to insert sync cursor: {}", e))?;
    }

    Ok(())
}

fn extract_first_string(rows: Vec<DbRow>) -> Option<String> {
    rows.first()
        .and_then(|row| row.values.first())
        .and_then(|value| value.as_str())
        .map(|s| s.to_string())
}

fn current_time_millis_string() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .to_string()
}
