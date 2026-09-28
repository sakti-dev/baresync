use serde_json::Value;

use crate::config::SyncEngineConfig;
use crate::cursor;
use crate::db::DbClient;
use crate::error::SyncError;
use serde_json::json;

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
    db: &DbClient,
    upsert_order: &[String],
    delete_order: &[String],
    response_tables: &Value,
    server_time: &str,
    _local_only_columns: &[&str],
) -> Result<usize, SyncError> {
    let mut applied = 0;
    let mut statements: Vec<(String, Vec<Value>)> = Vec::new();

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
                    SyncError::JsonParse("Pull table entry missing 'table' field".to_string())
                })?;

            if let Some(changed_rows) = table_entry.get("changedRows").and_then(|r| r.as_array()) {
                for row in changed_rows {
                    let statement = super::push::build_upsert_statement(table_name, row)?;
                    if !statement.0.is_empty() {
                        statements.push(statement);
                    }
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
                        statements.push(super::push::build_soft_delete_statement(
                            table_entry
                                .get("table")
                                .and_then(|t| t.as_str())
                                .unwrap_or(""),
                            id_str,
                            server_time,
                        ));
                        applied += 1;
                    }
                }
            }
        }
    }

    if !statements.is_empty() {
        if let Err(batch_err) = db.batch(statements.clone()).await {
            // A single constraint-violating row (e.g. an orphaned child on
            // the server whose parent row is gone) must not brick the sync
            // forever. Fall back to per-statement apply: succeed for every
            // representable row, skip + loudly log the poison rows.
            log::warn!(
                "[baresync] pull batch failed ({}), falling back to per-row apply: {}",
                statements.len(),
                batch_err
            );
            for (sql, params) in &statements {
                match db.execute(sql, params.clone()).await {
                    Ok(_) => {}
                    Err(row_err) => {
                        log::error!(
                            "[baresync] pull row skipped (quarantined): {} — {}",
                            row_err,
                            sql
                        );
                    }
                }
            }
        }
    }

    Ok(applied)
}

#[allow(clippy::too_many_arguments)]
pub async fn pull(
    db: &DbClient,
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
        PullStartCursor::Stored => cursor::get_last_cursor(db, &config.scope_id)
            .await
            .map_err(SyncError::Database)?,
    };

    let tables_to_pull: &[String] = match table_filter {
        Some(filter) => filter,
        None => upsert_order,
    };

    let response = config
        .transport
        .send_pull_request(
            config.api_url.clone(),
            json!({
                "scopeId": config.scope_id.clone(),
                "tables": tables_to_pull,
                "limit": limit,
                "cursor": cursor_value,
            }),
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

    let applied = apply_pull_batch_tables_tx(
        db,
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

    if !new_cursor.is_empty() {
        if matches!(start_cursor, PullStartCursor::Stored) {
            cursor::set_last_cursor_tx(db, &config.scope_id, &new_cursor)
                .await
                .map_err(SyncError::Database)?;
        } else if cursor::get_last_cursor(db, &config.scope_id)
            .await
            .map_err(SyncError::Database)?
            .is_empty()
        {
            cursor::set_last_cursor_tx(db, &config.scope_id, &new_cursor)
                .await
                .map_err(SyncError::Database)?;
        }
    }

    Ok(PullResult {
        rows_received: applied,
        server_time,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn pull_batch_falls_back_to_per_row_apply_on_fk_failure() {
        let db = crate::db::DbClient::connect(":memory:").await.unwrap();
        db.execute(
            "CREATE TABLE parent (id text PRIMARY KEY, updated_at text, is_synced integer)",
            vec![],
        )
        .await
        .unwrap();
        db.execute(
            "CREATE TABLE child (
                id text PRIMARY KEY,
                parent_id text NOT NULL REFERENCES parent(id),
                updated_at text,
                is_synced integer
            )",
            vec![],
        )
        .await
        .unwrap();

        // c-poison references a parent that never arrives; c-good is fine.
        let response_tables = json!([
            {
                "table": "parent",
                "changedRows": [
                    { "id": "p1", "updatedAt": "2026-01-01T00:00:00Z" }
                ]
            },
            {
                "table": "child",
                "changedRows": [
                    { "id": "c-poison", "parentId": "p-missing", "updatedAt": "2026-01-01T00:00:00Z" },
                    { "id": "c-good", "parentId": "p1", "updatedAt": "2026-01-01T00:00:00Z" }
                ]
            }
        ]);

        let applied = apply_pull_batch_tables_tx(
            &db,
            &["parent".to_string(), "child".to_string()],
            &[],
            &response_tables,
            "2026-01-01T00:00:00Z",
            &[],
        )
        .await
        .unwrap();

        assert_eq!(applied, 3);
        let parents = db.query("SELECT id FROM parent", vec![]).await.unwrap();
        assert_eq!(parents.len(), 1);
        let children = db.query("SELECT id FROM child", vec![]).await.unwrap();
        assert_eq!(children.len(), 1);
        assert_eq!(children[0].values[0].as_str().unwrap(), "c-good");
    }
}
