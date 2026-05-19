use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::{SqliteConnection, SqlitePool};
use std::collections::{HashMap, HashSet};

use super::config::SyncEngineConfig;
use super::error::SyncError;
use super::http::send_push_request;
use super::outbox;
use super::schema::{self, TableOutboxChanges};

#[derive(Debug, serde::Serialize)]
pub struct PushResult {
    pub tables_synced: Vec<String>,
    pub rejected_tables: Vec<String>,
    pub server_wins_count: usize,
    pub server_time: String,
}

pub fn build_upsert_query(table: &str, columns: &[String]) -> String {
    let placeholders: Vec<String> = (1..=columns.len()).map(|i| format!("?{}", i)).collect();
    let set_clause: Vec<String> = columns
        .iter()
        .filter(|c| *c != "id")
        .map(|c| format!("{} = excluded.{}", c, c))
        .collect();

    if set_clause.is_empty() {
        return format!(
            "INSERT OR IGNORE INTO {} ({}) VALUES ({})",
            table,
            columns.join(", "),
            placeholders.join(", ")
        );
    }

    format!(
        "INSERT INTO {} ({}) VALUES ({}) ON CONFLICT(id) DO UPDATE SET {} WHERE {}.is_synced = 1 OR excluded.updated_at >= {}.updated_at",
        table,
        columns.join(", "),
        placeholders.join(", "),
        set_clause.join(", "),
        table,
        table
    )
}

pub async fn upsert_row(
    conn: &mut SqliteConnection,
    table: &str,
    row: &Value,
) -> Result<(), SyncError> {
    let obj = row
        .as_object()
        .ok_or_else(|| SyncError::Encoding(format!("Row for {} is not a JSON object", table)))?;

    let mut local_obj: serde_json::Map<String, Value> = obj
        .iter()
        .map(|(k, v)| (schema::camel_to_snake(k), v.clone()))
        .collect();
    local_obj.insert("is_synced".to_string(), Value::Bool(true));

    let columns: Vec<String> = local_obj.keys().cloned().collect();
    if columns.is_empty() {
        return Ok(());
    }

    let query = build_upsert_query(table, &columns);
    let mut q = sqlx::query(&query);
    for col in &columns {
        let val = &local_obj[col];
        match val {
            Value::Null => q = q.bind(None::<String>),
            Value::Bool(b) => q = q.bind(*b),
            Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    q = q.bind(i);
                } else if let Some(f) = n.as_f64() {
                    q = q.bind(f);
                } else {
                    q = q.bind::<Option<i64>>(None);
                }
            }
            Value::String(s) => q = q.bind(s.clone()),
            Value::Array(_) | Value::Object(_) => {
                q = q.bind(serde_json::to_string(val).unwrap_or_default())
            }
        }
    }

    q.execute(conn)
        .await
        .map_err(|e| SyncError::Database(format!("Failed to upsert into {}: {}", table, e)))?;
    Ok(())
}

pub async fn soft_delete_row(
    conn: &mut SqliteConnection,
    table: &str,
    id: &str,
    deleted_at: &str,
) -> Result<u64, SyncError> {
    let query = format!(
        "UPDATE {} SET deleted_at = ?1, updated_at = ?1, is_synced = 1 WHERE id = ?2",
        table
    );
    let result = sqlx::query(&query)
        .bind(deleted_at)
        .bind(id)
        .execute(&mut *conn)
        .await
        .map_err(|e| SyncError::Database(format!("Failed to soft delete {} row {}: {}", table, id, e)))?;
    Ok(result.rows_affected())
}

pub fn generate_idempotency_key_from_outbox_ids(outbox_ids: &[String]) -> String {
    let mut sorted_ids = outbox_ids.to_vec();
    sorted_ids.sort();

    let mut hasher = Sha256::new();
    for id in sorted_ids {
        hasher.update(id.as_bytes());
        hasher.update([0]);
    }

    format!("{:x}", hasher.finalize())
}

pub fn build_json_push_envelope(
    scope_id: &str,
    client_id: &str,
    idempotency_key: &str,
    table_changes: &[(String, schema::TablePushChanges)],
) -> Value {
    let tables: Vec<Value> = table_changes
        .iter()
        .map(|(table, changes)| {
            serde_json::json!({
                "table": table,
                "changedRows": changes.changed_rows,
                "deletedIds": changes.deleted_ids,
            })
        })
        .collect();

    serde_json::json!({
        "scopeId": scope_id,
        "clientId": client_id,
        "idempotencyKey": idempotency_key,
        "tables": tables,
    })
}

fn accepted_ids_by_table(response: &Value) -> HashMap<String, HashSet<String>> {
    let mut result = HashMap::new();
    let Some(tables) = response.get("tables").and_then(|t| t.as_array()) else {
        return result;
    };
    for table_ack in tables {
        let table_name = table_ack
            .get("table")
            .and_then(|t| t.as_str())
            .unwrap_or("");
        let ids = result.entry(table_name.to_string()).or_insert_with(HashSet::new);
        for key in &["acceptedCreatedIds", "acceptedUpdatedIds", "acceptedDeletedIds"] {
            if let Some(arr) = table_ack.get(key).and_then(|v| v.as_array()) {
                for id in arr {
                    if let Some(s) = id.as_str() {
                        ids.insert(s.to_string());
                    }
                }
            }
        }
    }
    result
}

fn rejected_ids_by_table(response: &Value) -> HashMap<String, HashSet<String>> {
    let mut result = HashMap::new();
    let Some(tables) = response.get("tables").and_then(|t| t.as_array()) else {
        return result;
    };
    for table_ack in tables {
        let table_name = table_ack
            .get("table")
            .and_then(|t| t.as_str())
            .unwrap_or("");
        let ids = result
            .entry(table_name.to_string())
            .or_insert_with(HashSet::new);
        if let Some(rejected) = table_ack.get("rejected").and_then(|v| v.as_array()) {
            for row in rejected {
                if let Some(id) = row.get("id").and_then(|v| v.as_str()) {
                    ids.insert(id.to_string());
                }
            }
        }
    }
    result
}

pub async fn push(
    pool: &SqlitePool,
    config: &SyncEngineConfig,
    upsert_order: &[String],
    local_only_columns: &[&str],
) -> Result<PushResult, SyncError> {
    let mut all_table_changes: Vec<(String, schema::TablePushChanges)> = Vec::new();
    let mut all_outbox_ids: Vec<String> = Vec::new();
    let mut outbox_ids_by_table: HashMap<String, Vec<String>> = HashMap::new();

    for table in upsert_order {
        let mut tx = pool.begin().await.map_err(|e| SyncError::Database(format!("Failed to begin tx: {}", e)))?;
        let changes: TableOutboxChanges = schema::read_unsynced_table_changes_from_outbox_tx(
            &mut tx,
            table,
            &config.scope_id,
            local_only_columns,
        )
        .await
        .map_err(|e| SyncError::Database(e))?;

        drop(tx);

        if changes.changes.changed_rows.is_empty() && changes.changes.deleted_ids.is_empty() {
            continue;
        }

        for (_, ids) in &changes.outbox_ids_by_row_id {
            all_outbox_ids.extend(ids.iter().cloned());
        }
        outbox_ids_by_table.insert(table.clone(), changes.outbox_ids_by_row_id.into_values().flatten().collect());
        all_table_changes.push((table.clone(), changes.changes));
    }

    if all_table_changes.is_empty() {
        return Ok(PushResult {
            tables_synced: Vec::new(),
            rejected_tables: Vec::new(),
            server_wins_count: 0,
            server_time: String::new(),
        });
    }

    let idempotency_key = generate_idempotency_key_from_outbox_ids(&all_outbox_ids);
    let envelope = build_json_push_envelope(
        &config.scope_id,
        &config.client_id,
        &idempotency_key,
        &all_table_changes,
    );

    let response = send_push_request(&config.api_url, &envelope).await?;

    let server_time = response
        .get("serverTime")
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .to_string();

    let accepted = accepted_ids_by_table(&response);
    let rejected = rejected_ids_by_table(&response);
    let server_wins_count: usize = rejected.values().map(|s| s.len()).sum();

    let mut tables_synced = Vec::new();
    let mut tx = pool.begin().await.map_err(|e| SyncError::Database(format!("Failed to begin result tx: {}", e)))?;

    for table in upsert_order {
        let Some(accepted_ids) = accepted.get(table) else {
            continue;
        };
        if !accepted_ids.is_empty() {
            schema::mark_rows_synced_by_id_tx(&mut tx, table, accepted_ids)
                .await
                .map_err(|e| SyncError::Database(e))?;

            let accepted_outbox_ids: Vec<String> = outbox_ids_by_table
                .get(table)
                .cloned()
                .unwrap_or_default();

            outbox::mark_outbox_synced_by_outbox_ids_tx(&mut tx, &server_time, &accepted_outbox_ids)
                .await
                .map_err(|e| SyncError::Database(e))?;

            tables_synced.push(table.clone());
        }
    }

    tx.commit()
        .await
        .map_err(|e| SyncError::Database(format!("Failed to commit push result: {}", e)))?;

    let rejected_tables: Vec<String> = rejected.keys().cloned().collect();

    Ok(PushResult {
        tables_synced,
        rejected_tables,
        server_wins_count,
        server_time,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn idempotency_key_is_deterministic() {
        let first = generate_idempotency_key_from_outbox_ids(&[
            "outbox-2".to_string(),
            "outbox-1".to_string(),
        ]);
        let second = generate_idempotency_key_from_outbox_ids(&[
            "outbox-1".to_string(),
            "outbox-2".to_string(),
        ]);
        assert_eq!(first, second);
    }

    #[test]
    fn different_ids_produce_different_keys() {
        let first = generate_idempotency_key_from_outbox_ids(&["a".to_string()]);
        let second = generate_idempotency_key_from_outbox_ids(&["b".to_string()]);
        assert_ne!(first, second);
    }

    #[test]
    fn build_upsert_query_generates_conflict_clause() {
        let query = build_upsert_query("products", &["id".to_string(), "name".to_string(), "updated_at".to_string()]);
        assert!(query.contains("ON CONFLICT(id) DO UPDATE"));
        assert!(query.contains("WHERE products.is_synced = 1 OR excluded.updated_at >= products.updated_at"));
    }
}
