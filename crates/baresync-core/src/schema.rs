use crate::db::{DbClient, DbRow};
use serde_json::Value;
use std::collections::HashMap;

pub fn camel_to_snake(s: &str) -> String {
    let mut result = String::with_capacity(s.len() + 4);
    for (i, c) in s.chars().enumerate() {
        if c.is_uppercase() {
            if i > 0 {
                result.push('_');
            }
            result.extend(c.to_lowercase());
        } else {
            result.push(c);
        }
    }
    result
}

pub fn snake_to_camel(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut capitalize_next = false;
    for c in s.chars() {
        if c == '_' {
            capitalize_next = true;
        } else if capitalize_next {
            result.extend(c.to_uppercase());
            capitalize_next = false;
        } else {
            result.push(c);
        }
    }
    result
}

#[derive(Debug, Clone)]
pub struct CoalescedOutboxRow {
    pub operation: String,
    pub row: Option<Value>,
}

pub fn coalesce_operation(previous: Option<&str>, next: &str) -> Result<Option<String>, String> {
    match (previous, next) {
        (None, "insert" | "update" | "delete") => Ok(Some(next.to_string())),
        (Some("insert"), "update") => Ok(Some("insert".to_string())),
        (Some("insert"), "delete") => Ok(None),
        (Some("update"), "update") => Ok(Some("update".to_string())),
        (Some("update"), "delete") => Ok(Some("delete".to_string())),
        (Some("delete"), "insert") => Ok(Some("update".to_string())),
        (Some("delete"), "update") => Ok(Some("update".to_string())),
        (Some("delete"), "delete") => Ok(Some("delete".to_string())),
        (_, "insert" | "update" | "delete") => Ok(Some(next.to_string())),
        (_, other) => Err(format!("Unknown sync outbox operation: {}", other)),
    }
}

#[derive(Debug)]
pub struct OutboxRowForSync {
    pub operation: String,
    pub row_id: String,
    pub row: Option<Value>,
}

#[derive(Debug, Default)]
pub struct TablePushChanges {
    pub changed_rows: Vec<Value>,
    pub deleted_ids: Vec<String>,
}

#[derive(Debug)]
pub struct TableOutboxChanges {
    pub changes: TablePushChanges,
    pub outbox_ids_by_row_id: HashMap<String, Vec<String>>,
}

pub fn outbox_rows_to_table_changes(
    rows: Vec<OutboxRowForSync>,
    local_only_columns: &[&str],
) -> Result<TablePushChanges, String> {
    let mut order: Vec<String> = Vec::new();
    let mut by_id = HashMap::<String, CoalescedOutboxRow>::new();

    for item in rows {
        if !by_id.contains_key(&item.row_id) {
            order.push(item.row_id.clone());
        }
        let previous = by_id.get(&item.row_id).map(|e| e.operation.as_str());
        match coalesce_operation(previous, &item.operation)? {
            Some(operation) => {
                by_id.insert(
                    item.row_id,
                    CoalescedOutboxRow {
                        operation,
                        row: item.row,
                    },
                );
            }
            None => {
                by_id.remove(&item.row_id);
            }
        }
    }

    let mut changes = TablePushChanges::default();
    for row_id in order {
        let Some(entry) = by_id.remove(&row_id) else {
            continue;
        };
        match entry.operation.as_str() {
            "insert" | "update" => {
                let row = entry.row.ok_or_else(|| {
                    format!(
                        "Sync row {} with operation {} is missing payload",
                        row_id, entry.operation
                    )
                })?;
                let filtered = filter_local_columns(&row, local_only_columns);
                changes.changed_rows.push(filtered);
            }
            "delete" => {
                if let Some(row) = entry.row {
                    let filtered = filter_local_columns(&row, local_only_columns);
                    changes.changed_rows.push(filtered);
                } else {
                    changes.deleted_ids.push(row_id);
                }
            }
            other => return Err(format!("Unknown sync outbox operation: {}", other)),
        }
    }

    Ok(changes)
}

fn filter_local_columns(row: &Value, local_only_columns: &[&str]) -> Value {
    let Some(obj) = row.as_object() else {
        return row.clone();
    };
    let camel_local: Vec<String> = local_only_columns
        .iter()
        .flat_map(|c| {
            let snake = camel_to_snake(c);
            vec![c.to_string(), snake]
        })
        .collect();
    let filtered: serde_json::Map<String, Value> = obj
        .iter()
        .filter(|(k, _)| {
            let snake_k = camel_to_snake(k);
            !camel_local
                .iter()
                .any(|l| l.as_str() == k.as_str() || l.as_str() == snake_k.as_str())
        })
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    Value::Object(filtered)
}

pub async fn read_unsynced_table_changes_from_outbox_tx(
    db: &DbClient,
    table: &str,
    scope_id: &str,
    local_only_columns: &[&str],
) -> Result<TableOutboxChanges, String> {
    let query = format!(
        "SELECT t.*, o.id AS __sync_outbox_id, o.operation AS __sync_operation, o.row_id AS __sync_row_id
         FROM sync_outbox o
         LEFT JOIN {table} t ON t.id = o.row_id
         WHERE o.table_name = ?1 AND o.scope_id = ?2 AND o.synced_at IS NULL
         ORDER BY o.changed_at ASC, o.id ASC"
    );
    let rows = db
        .query(
            &query,
            vec![
                Value::String(table.to_string()),
                Value::String(scope_id.to_string()),
            ],
        )
        .await
        .map_err(|e| {
            format!(
                "Failed to read unsynced outbox changes for {}: {}",
                table, e
            )
        })?;

    let local_only_snake: Vec<String> = local_only_columns
        .iter()
        .map(|c| camel_to_snake(c))
        .collect();
    let mut result = Vec::new();
    let mut outbox_ids_by_row_id: HashMap<String, Vec<String>> = HashMap::new();
    for row in &rows {
        let outbox_id = row_value_as_string(row, "__sync_outbox_id")
            .ok_or_else(|| format!("Failed to read sync outbox id for {}", table))?;
        let operation = row_value_as_string(row, "__sync_operation")
            .ok_or_else(|| format!("Failed to read sync operation for {}", table))?;
        let row_id = row_value_as_string(row, "__sync_row_id")
            .ok_or_else(|| format!("Failed to read sync row id for {}", table))?;
        let mut obj = serde_json::Map::new();
        let mut has_source_row = false;
        for (idx, name) in row.columns.iter().enumerate() {
            if name.starts_with("__sync_") || local_only_snake.iter().any(|l| l == name) {
                continue;
            }
            let val = row.values.get(idx).cloned().unwrap_or(Value::Null);
            if name == "id" && !val.is_null() {
                has_source_row = true;
            }
            obj.insert(snake_to_camel(name), val);
        }
        outbox_ids_by_row_id
            .entry(row_id.clone())
            .or_default()
            .push(outbox_id);
        result.push(OutboxRowForSync {
            operation,
            row_id,
            row: has_source_row.then_some(Value::Object(obj)),
        });
    }

    Ok(TableOutboxChanges {
        changes: outbox_rows_to_table_changes(result, local_only_columns)?,
        outbox_ids_by_row_id,
    })
}

pub async fn mark_rows_synced_by_id_tx(
    db: &DbClient,
    table: &str,
    accepted_ids: &std::collections::HashSet<String>,
) -> Result<(), String> {
    if accepted_ids.is_empty() {
        return Ok(());
    }

    let query = format!(
        "UPDATE {} SET is_synced = 1
         WHERE NOT EXISTS (
            SELECT 1 FROM sync_outbox
            WHERE sync_outbox.table_name = ?
              AND sync_outbox.row_id = {}.id
              AND sync_outbox.synced_at IS NULL
         )
         AND id IN ({})",
        table,
        table,
        accepted_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(",")
    );
    let mut params = vec![Value::String(table.to_string())];
    params.extend(accepted_ids.iter().cloned().map(Value::String));
    db.execute(&query, params).await.map_err(|e| {
        format!(
            "Failed to mark accepted rows for {} as synced: {}",
            table, e
        )
    })?;

    Ok(())
}

fn row_value_as_string(row: &DbRow, column: &str) -> Option<String> {
    row.columns
        .iter()
        .position(|name| name == column)
        .and_then(|idx| row.values.get(idx))
        .and_then(|value| value.as_str())
        .map(|s| s.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn camel_to_snake_converts_correctly() {
        assert_eq!(camel_to_snake("merchantId"), "merchant_id");
        assert_eq!(camel_to_snake("isSynced"), "is_synced");
        assert_eq!(camel_to_snake("id"), "id");
    }

    #[test]
    fn snake_to_camel_converts_correctly() {
        assert_eq!(snake_to_camel("merchant_id"), "merchantId");
        assert_eq!(snake_to_camel("is_synced"), "isSynced");
        assert_eq!(snake_to_camel("id"), "id");
    }

    #[test]
    fn coalesce_insert_then_delete_cancels() {
        let result = coalesce_operation(Some("insert"), "delete").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn coalesce_insert_then_update_stays_insert() {
        let result = coalesce_operation(Some("insert"), "update").unwrap();
        assert_eq!(result, Some("insert".to_string()));
    }

    #[test]
    fn coalesce_update_then_delete_becomes_delete() {
        let result = coalesce_operation(Some("update"), "delete").unwrap();
        assert_eq!(result, Some("delete".to_string()));
    }
}
