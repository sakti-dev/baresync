use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::{SqliteConnection, SqlitePool};
use std::collections::VecDeque;
use std::collections::{HashMap, HashSet};

use super::config::SyncEngineConfig;
use super::error::SyncError;
use super::outbox;
use super::schema::{self, TableOutboxChanges};

#[derive(Debug, Clone)]
pub struct PendingTablePush {
    pub table: String,
    pub row: Option<Value>,
    pub deleted_id: Option<String>,
    pub outbox_ids: Vec<String>,
}

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
        .map_err(|e| {
            SyncError::Database(format!("Failed to soft delete {} row {}: {}", table, id, e))
        })?;
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
        let ids = result
            .entry(table_name.to_string())
            .or_insert_with(HashSet::new);
        for key in &[
            "acceptedCreatedIds",
            "acceptedUpdatedIds",
            "acceptedDeletedIds",
        ] {
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
        if let Some(rejected) = table_ack.get("rejected").and_then(|v| v.as_array()) {
            for row in rejected {
                if let Some(id) = row.get("id").and_then(|v| v.as_str()) {
                    result
                        .entry(table_name.to_string())
                        .or_insert_with(HashSet::new)
                        .insert(id.to_string());
                }
            }
        }
    }
    result
}

pub fn flatten_pending_tables(
    table_name: &str,
    changes: &TableOutboxChanges,
) -> Vec<PendingTablePush> {
    let mut units = Vec::new();

    for row in &changes.changes.changed_rows {
        let row_id = row
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let outbox_ids = changes
            .outbox_ids_by_row_id
            .get(&row_id)
            .cloned()
            .unwrap_or_default();
        units.push(PendingTablePush {
            table: table_name.to_string(),
            row: Some(row.clone()),
            deleted_id: None,
            outbox_ids,
        });
    }

    for deleted_id in &changes.changes.deleted_ids {
        let outbox_ids = changes
            .outbox_ids_by_row_id
            .get(deleted_id)
            .cloned()
            .unwrap_or_default();
        units.push(PendingTablePush {
            table: table_name.to_string(),
            row: None,
            deleted_id: Some(deleted_id.clone()),
            outbox_ids,
        });
    }

    units
}

pub fn merge_pending_units(
    units: Vec<PendingTablePush>,
) -> Vec<(String, schema::TablePushChanges)> {
    let mut by_table: HashMap<String, schema::TablePushChanges> = HashMap::new();

    for unit in units {
        let entry = by_table.entry(unit.table.clone()).or_default();
        if let Some(row) = unit.row {
            entry.changed_rows.push(row);
        }
        if let Some(id) = unit.deleted_id {
            entry.deleted_ids.push(id);
        }
    }

    let mut result: Vec<(String, schema::TablePushChanges)> = by_table.into_iter().collect();
    result.sort_by(|a, b| a.0.cmp(&b.0));
    result
}

pub fn encoded_push_chunk_len(
    scope_id: &str,
    client_id: &str,
    idempotency_key: &str,
    tables: &[(String, schema::TablePushChanges)],
) -> usize {
    let envelope = build_json_push_envelope(scope_id, client_id, idempotency_key, tables);
    serde_json::to_string(&envelope)
        .map(|s| s.len())
        .unwrap_or(0)
}

pub fn collect_outbox_ids(units: &[PendingTablePush]) -> Vec<String> {
    let mut ids: Vec<String> = units
        .iter()
        .flat_map(|u| u.outbox_ids.iter().cloned())
        .collect();
    ids.sort();
    ids.dedup();
    ids
}

pub fn chunk_pending_push_tables(
    units: Vec<PendingTablePush>,
    max_rows: usize,
    max_bytes: usize,
    scope_id: &str,
    client_id: &str,
) -> Vec<Vec<PendingTablePush>> {
    if units.is_empty() {
        return Vec::new();
    }

    let mut chunks: Vec<Vec<PendingTablePush>> = Vec::new();
    let mut current: Vec<PendingTablePush> = Vec::new();

    for unit in units {
        let candidate_count = current.len() + 1;
        let mut candidate = current.clone();
        candidate.push(unit.clone());

        let merged = merge_pending_units(candidate.clone());
        let ids = collect_outbox_ids(&candidate);
        let idem_key = generate_idempotency_key_from_outbox_ids(&ids);
        let byte_len = encoded_push_chunk_len(scope_id, client_id, &idem_key, &merged);

        if candidate_count > max_rows || byte_len > max_bytes {
            if !current.is_empty() {
                chunks.push(current);
            }
            current = vec![unit];
        } else {
            current = candidate;
        }
    }

    if !current.is_empty() {
        chunks.push(current);
    }

    chunks
}

pub fn split_push_chunk_for_retry(
    chunk: &[PendingTablePush],
) -> (Vec<PendingTablePush>, Vec<PendingTablePush>) {
    let mid = chunk.len() / 2;
    let first: Vec<PendingTablePush> = chunk[..mid].to_vec();
    let second: Vec<PendingTablePush> = chunk[mid..].to_vec();
    (first, second)
}

pub async fn push(
    pool: &SqlitePool,
    config: &SyncEngineConfig,
    upsert_order: &[String],
    local_only_columns: &[&str],
) -> Result<PushResult, SyncError> {
    let mut all_units: Vec<PendingTablePush> = Vec::new();

    for table in upsert_order {
        let mut tx = pool
            .begin()
            .await
            .map_err(|e| SyncError::Database(format!("Failed to begin tx: {}", e)))?;
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

        let units = flatten_pending_tables(table, &changes);
        all_units.extend(units);
    }

    if all_units.is_empty() {
        return Ok(PushResult {
            tables_synced: Vec::new(),
            rejected_tables: Vec::new(),
            server_wins_count: 0,
            server_time: String::new(),
        });
    }

    let initial_chunks = chunk_pending_push_tables(
        all_units,
        config.max_push_rows,
        config.target_push_bytes,
        &config.scope_id,
        &config.client_id,
    );

    let mut stack: VecDeque<Vec<PendingTablePush>> = initial_chunks.into_iter().collect();
    let mut all_accepted: HashMap<String, HashSet<String>> = HashMap::new();
    let mut all_rejected: HashMap<String, HashSet<String>> = HashMap::new();
    let mut all_outbox_ids_by_table: HashMap<String, Vec<String>> = HashMap::new();
    let mut final_server_time = String::new();

    while let Some(chunk) = stack.pop_front() {
        let merged = merge_pending_units(chunk.clone());
        let ids = collect_outbox_ids(&chunk);
        let idem_key = generate_idempotency_key_from_outbox_ids(&ids);

        let byte_len =
            encoded_push_chunk_len(&config.scope_id, &config.client_id, &idem_key, &merged);

        if byte_len > config.max_push_bytes && chunk.len() > 1 {
            let (first, second) = split_push_chunk_for_retry(&chunk);
            if !first.is_empty() {
                stack.push_front(first);
            }
            if !second.is_empty() {
                stack.push_front(second);
            }
            continue;
        }

        if chunk.len() == 1 && byte_len > config.max_push_bytes {
            let unit = &chunk[0];
            let table = unit.table.clone();
            let id = unit
                .row
                .as_ref()
                .and_then(|r| r.get("id").and_then(|v| v.as_str()))
                .or(unit.deleted_id.as_deref())
                .unwrap_or("unknown")
                .to_string();
            return Err(SyncError::SingleRowTooLarge { table, id });
        }

        for unit in &chunk {
            all_outbox_ids_by_table
                .entry(unit.table.clone())
                .or_default()
                .extend(unit.outbox_ids.iter().cloned());
        }

        let envelope =
            build_json_push_envelope(&config.scope_id, &config.client_id, &idem_key, &merged);

        let response = match config
            .transport
            .send_push_request(config.api_url.clone(), envelope)
            .await
        {
            Ok(r) => r,
            Err(SyncError::Http { status: 413, .. }) => {
                if chunk.len() == 1 {
                    let unit = &chunk[0];
                    let table = unit.table.clone();
                    let id = unit
                        .row
                        .as_ref()
                        .and_then(|r| r.get("id").and_then(|v| v.as_str()))
                        .or(unit.deleted_id.as_deref())
                        .unwrap_or("unknown")
                        .to_string();
                    return Err(SyncError::SingleRowTooLarge { table, id });
                }
                let (first, second) = split_push_chunk_for_retry(&chunk);
                if !first.is_empty() {
                    stack.push_front(first);
                }
                if !second.is_empty() {
                    stack.push_front(second);
                }
                continue;
            }
            Err(e) => return Err(e),
        };

        let server_time = response
            .get("serverTime")
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .to_string();
        if !server_time.is_empty() {
            final_server_time = server_time;
        }

        let accepted = accepted_ids_by_table(&response);
        let rejected = rejected_ids_by_table(&response);

        for (table, ids) in &accepted {
            all_accepted
                .entry(table.clone())
                .or_default()
                .extend(ids.iter().cloned());
        }
        for (table, ids) in &rejected {
            all_rejected
                .entry(table.clone())
                .or_default()
                .extend(ids.iter().cloned());
        }
    }

    let server_wins_count: usize = all_rejected.values().map(|s| s.len()).sum();
    let rejected_tables: Vec<String> = all_rejected.keys().cloned().collect();

    let mut tables_synced = Vec::new();
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| SyncError::Database(format!("Failed to begin result tx: {}", e)))?;

    for table in upsert_order {
        let Some(accepted_ids) = all_accepted.get(table) else {
            continue;
        };
        if !accepted_ids.is_empty() {
            let accepted_outbox_ids: Vec<String> = all_outbox_ids_by_table
                .get(table)
                .cloned()
                .unwrap_or_default();

            outbox::mark_outbox_synced_by_outbox_ids_tx(
                &mut tx,
                &final_server_time,
                &accepted_outbox_ids,
            )
            .await
            .map_err(|e| SyncError::Database(e))?;

            schema::mark_rows_synced_by_id_tx(&mut tx, table, accepted_ids)
                .await
                .map_err(|e| SyncError::Database(e))?;

            tables_synced.push(table.clone());
        }
    }

    tx.commit()
        .await
        .map_err(|e| SyncError::Database(format!("Failed to commit push result: {}", e)))?;

    Ok(PushResult {
        tables_synced,
        rejected_tables,
        server_wins_count,
        server_time: final_server_time,
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
        let query = build_upsert_query(
            "products",
            &[
                "id".to_string(),
                "name".to_string(),
                "updated_at".to_string(),
            ],
        );
        assert!(query.contains("ON CONFLICT(id) DO UPDATE"));
        assert!(query.contains(
            "WHERE products.is_synced = 1 OR excluded.updated_at >= products.updated_at"
        ));
    }

    fn make_changes(n_rows: usize, n_deletes: usize) -> TableOutboxChanges {
        let mut changes = schema::TablePushChanges::default();
        let mut outbox_ids_by_row_id = HashMap::new();
        for i in 0..n_rows {
            let id = format!("row-{}", i);
            changes.changed_rows.push(serde_json::json!({
                "id": id,
                "name": format!("item {}", i),
            }));
            outbox_ids_by_row_id.insert(id, vec![format!("outbox-row-{}", i)]);
        }
        for i in 0..n_deletes {
            let id = format!("del-{}", i);
            changes.deleted_ids.push(id.clone());
            outbox_ids_by_row_id.insert(id, vec![format!("outbox-del-{}", i)]);
        }
        TableOutboxChanges {
            changes,
            outbox_ids_by_row_id,
        }
    }

    #[test]
    fn flatten_produces_per_row_units() {
        let changes = make_changes(3, 2);
        let units = flatten_pending_tables("items", &changes);
        assert_eq!(units.len(), 5);
        assert_eq!(units.iter().filter(|u| u.row.is_some()).count(), 3);
        assert_eq!(units.iter().filter(|u| u.deleted_id.is_some()).count(), 2);
    }

    #[test]
    fn flatten_preserves_outbox_ids() {
        let changes = make_changes(2, 0);
        let units = flatten_pending_tables("items", &changes);
        assert_eq!(units[0].outbox_ids, vec!["outbox-row-0"]);
        assert_eq!(units[1].outbox_ids, vec!["outbox-row-1"]);
    }

    #[test]
    fn merge_roundtrips_flatten() {
        let changes = make_changes(3, 2);
        let units = flatten_pending_tables("items", &changes);
        let merged = merge_pending_units(units);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].0, "items");
        assert_eq!(merged[0].1.changed_rows.len(), 3);
        assert_eq!(merged[0].1.deleted_ids.len(), 2);
    }

    #[test]
    fn chunk_splits_at_max_rows() {
        let changes = make_changes(2500, 0);
        let units = flatten_pending_tables("items", &changes);
        let chunks = chunk_pending_push_tables(units, 2000, usize::MAX, "scope", "client");
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].len(), 2000);
        assert_eq!(chunks[1].len(), 500);
    }

    #[test]
    fn chunk_respects_byte_limit() {
        let changes = make_changes(10, 0);
        let units = flatten_pending_tables("items", &changes);
        let chunks = chunk_pending_push_tables(units, 100, 1, "scope", "client");
        assert!(chunks.len() > 1);
        for chunk in &chunks {
            assert_eq!(chunk.len(), 1);
        }
    }

    #[test]
    fn split_halves_at_midpoint() {
        let changes = make_changes(4, 0);
        let units = flatten_pending_tables("items", &changes);
        let (first, second) = split_push_chunk_for_retry(&units);
        assert_eq!(first.len(), 2);
        assert_eq!(second.len(), 2);
    }

    #[test]
    fn split_preserves_outbox_ids() {
        let changes = make_changes(4, 0);
        let units = flatten_pending_tables("items", &changes);
        let (first, second) = split_push_chunk_for_retry(&units);
        assert_eq!(first[0].outbox_ids, vec!["outbox-row-0"]);
        assert_eq!(first[1].outbox_ids, vec!["outbox-row-1"]);
        assert_eq!(second[0].outbox_ids, vec!["outbox-row-2"]);
        assert_eq!(second[1].outbox_ids, vec!["outbox-row-3"]);
    }

    #[test]
    fn accepted_and_rejected_ids_extracted_from_response() {
        let response = serde_json::json!({
            "tables": [{
                "table": "products",
                "acceptedCreatedIds": ["prod-1"],
                "acceptedUpdatedIds": ["prod-3"],
                "acceptedDeletedIds": ["prod-del-1"],
                "rejected": [
                    { "id": "prod-2", "reason": "server_newer" },
                    { "id": "prod-4", "reason": "server_newer" }
                ]
            }, {
                "table": "categories",
                "acceptedCreatedIds": ["cat-1"],
                "acceptedUpdatedIds": [],
                "acceptedDeletedIds": [],
                "rejected": []
            }]
        });

        let accepted = accepted_ids_by_table(&response);
        let rejected = rejected_ids_by_table(&response);

        assert!(accepted.get("products").unwrap().contains("prod-1"));
        assert!(accepted.get("products").unwrap().contains("prod-3"));
        assert!(accepted.get("products").unwrap().contains("prod-del-1"));
        assert!(accepted.get("categories").unwrap().contains("cat-1"));

        let prod_rejected = rejected.get("products").unwrap();
        assert_eq!(prod_rejected.len(), 2);
        assert!(prod_rejected.contains("prod-2"));
        assert!(prod_rejected.contains("prod-4"));
        assert!(!rejected.contains_key("categories"));
    }

    #[test]
    fn single_oversized_row_gets_own_chunk() {
        let changes = make_changes(1, 0);
        let units = flatten_pending_tables("items", &changes);
        let chunks = chunk_pending_push_tables(units, 1, usize::MAX, "scope", "client");
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].len(), 1);
    }
}
