use serde_json::Value;
use sqlx::{SqliteConnection, SqlitePool};

use crate::config::SyncEngineConfig;
use crate::cursor;
use crate::error::SyncError;

#[derive(Debug, Clone)]
pub enum PullStartCursor {
    Baseline,
    Stored,
}

#[derive(Debug, serde::Serialize)]
pub struct PullResult {
    pub rows_received: usize,
    pub server_time: String,
}

pub async fn apply_pull_batch_tables_tx(
    conn: &mut SqliteConnection,
    upsert_order: &[String],
    delete_order: &[String],
    response_tables: &Value,
    server_time: &str,
    _local_only_columns: &[&str],
) -> Result<usize, SyncError> {
    let mut applied = 0;

    if let Some(tables) = response_tables.as_array() {
        let ordered: Vec<&Value> = upsert_order
            .iter()
            .filter_map(|name| {
                tables
                    .iter()
                    .find(|t| t.get("table").and_then(|v| v.as_str()) == Some(name.as_str()))
            })
            .collect();

        for table_entry in &ordered {
            let table_name = table_entry
                .get("table")
                .and_then(|t| t.as_str())
                .ok_or_else(|| {
                    SyncError::Encoding("Pull table entry missing 'table' field".to_string())
                })?;

            if let Some(changed_rows) = table_entry.get("changedRows").and_then(|r| r.as_array()) {
                for row in changed_rows {
                    super::push::upsert_row(conn, table_name, row).await?;
                    applied += 1;
                }
            }
        }

        let delete_ordered: Vec<&Value> = delete_order
            .iter()
            .filter_map(|name| {
                tables
                    .iter()
                    .find(|t| t.get("table").and_then(|v| v.as_str()) == Some(name.as_str()))
            })
            .collect();

        for table_entry in &delete_ordered {
            if let Some(deleted_ids) = table_entry.get("deletedIds").and_then(|d| d.as_array()) {
                for id in deleted_ids {
                    if let Some(id_str) = id.as_str() {
                        super::push::soft_delete_row(
                            conn,
                            table_entry
                                .get("table")
                                .and_then(|t| t.as_str())
                                .unwrap_or(""),
                            id_str,
                            server_time,
                        )
                        .await?;
                        applied += 1;
                    }
                }
            }
        }
    }

    Ok(applied)
}

pub async fn pull(
    pool: &SqlitePool,
    config: &SyncEngineConfig,
    upsert_order: &[String],
    delete_order: &[String],
    local_only_columns: &[String],
    limit: i32,
    start_cursor: PullStartCursor,
    table_filter: Option<&[String]>,
) -> Result<PullResult, SyncError> {
    let cursor_value = match &start_cursor {
        PullStartCursor::Baseline => String::new(),
        PullStartCursor::Stored => cursor::get_last_cursor(pool, &config.scope_id)
            .await
            .map_err(|e| SyncError::Database(e))?,
    };

    let tables_to_pull: &[String] = match table_filter {
        Some(filter) => filter,
        None => upsert_order,
    };

    let response = config
        .transport
        .send_pull_request(
            config.api_url.clone(),
            config.scope_id.clone(),
            tables_to_pull.to_vec(),
            limit,
            cursor_value.clone(),
        )
        .await?;

    let server_time = response
        .get("serverTime")
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .to_string();

    let new_cursor = response
        .get("cursor")
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .to_string();

    let tables = response
        .get("tables")
        .cloned()
        .unwrap_or(Value::Array(Vec::new()));

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| SyncError::Database(format!("Failed to begin pull tx: {}", e)))?;

    let applied = apply_pull_batch_tables_tx(
        &mut tx,
        upsert_order,
        delete_order,
        &tables,
        &server_time,
        &local_only_columns
            .iter()
            .map(|s| s.as_str())
            .collect::<Vec<_>>(),
    )
    .await?;

    if matches!(start_cursor, PullStartCursor::Stored) && !new_cursor.is_empty() {
        cursor::set_last_cursor_tx(&mut tx, &config.scope_id, &new_cursor)
            .await
            .map_err(|e| SyncError::Database(e))?;
    }

    tx.commit()
        .await
        .map_err(|e| SyncError::Database(format!("Failed to commit pull: {}", e)))?;

    Ok(PullResult {
        rows_received: applied,
        server_time,
    })
}
