use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Column, Row, SqlitePool};

use crate::db;
use crate::error::SyncError;

#[derive(Debug, Deserialize)]
pub struct SqlQuery {
    pub sql: String,
    pub params: Vec<Value>,
    pub method: String,
}

#[derive(Debug, Serialize)]
pub struct SqlRow {
    pub columns: Vec<String>,
    pub values: Vec<Value>,
}

#[derive(Debug, Deserialize)]
pub struct SqlStatement {
    pub sql: String,
    pub params: Vec<Value>,
}

#[derive(Debug, Serialize)]
pub struct BatchResult {
    pub last_insert_id: i64,
    pub rows_affected: u64,
}

pub async fn run_sql(pool: &SqlitePool, query: SqlQuery) -> Result<Vec<SqlRow>, SyncError> {
    let mut q = sqlx::query(&query.sql);
    for param in &query.params {
        q = bind_value(q, param);
    }

    if query.method == "run" {
        q.execute(pool)
            .await
            .map_err(|e| SyncError::Database(format!("Query failed: {}", e)))?;
        return Ok(vec![]);
    }

    let rows = q
        .fetch_all(pool)
        .await
        .map_err(|e| SyncError::Database(format!("Query failed: {}", e)))?;

    let result: Vec<SqlRow> = rows
        .iter()
        .map(|row| {
            let columns = row
                .columns()
                .iter()
                .map(|c| c.name().to_string())
                .collect::<Vec<_>>();

            let values = (0..row.len())
                .map(|i| match row.try_get_raw(i) {
                    Ok(_) => db::sqlx_value_to_json(row, i),
                    Err(_) => Value::Null,
                })
                .collect::<Vec<_>>();

            SqlRow { columns, values }
        })
        .collect();

    Ok(result)
}

pub async fn run_sql_batch(
    pool: &SqlitePool,
    statements: Vec<SqlStatement>,
) -> Result<BatchResult, SyncError> {
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| SyncError::Database(format!("Failed to begin transaction: {}", e)))?;

    let mut last_insert_id: i64 = 0;
    let mut total_rows_affected: u64 = 0;

    for stmt in &statements {
        let mut q = sqlx::query(&stmt.sql);
        for param in &stmt.params {
            q = bind_value(q, param);
        }
        let result = q
            .execute(&mut *tx)
            .await
            .map_err(|e| SyncError::Database(format!("Batch statement failed: {}", e)))?;
        last_insert_id = result.last_insert_rowid();
        total_rows_affected += result.rows_affected();
    }

    tx.commit()
        .await
        .map_err(|e| SyncError::Database(format!("Failed to commit transaction: {}", e)))?;

    Ok(BatchResult {
        last_insert_id,
        rows_affected: total_rows_affected,
    })
}

fn bind_value<'q>(
    query: sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>>,
    value: &'q Value,
) -> sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>> {
    match value {
        Value::Null => query.bind(None::<String>),
        Value::Bool(b) => query.bind(*b),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                query.bind(i)
            } else if let Some(f) = n.as_f64() {
                query.bind(f)
            } else {
                query
            }
        }
        Value::String(s) => query.bind(s),
        _ => query,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;
    use std::str::FromStr;

    async fn test_pool() -> SqlitePool {
        let options = sqlx::sqlite::SqliteConnectOptions::from_str("sqlite::memory:")
            .unwrap()
            .pragma("foreign_keys", "ON");
        SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .unwrap()
    }

    async fn test_pool_with_table() -> SqlitePool {
        let pool = test_pool().await;
        sqlx::query("CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0)")
            .execute(&pool)
            .await
            .unwrap();
        pool
    }

    #[tokio::test]
    async fn run_sql_select_returns_rows() {
        let pool = test_pool_with_table().await;
        sqlx::query("INSERT INTO items (id, name, count) VALUES ('1', 'widget', 5)")
            .execute(&pool)
            .await
            .unwrap();

        let rows = run_sql(
            &pool,
            SqlQuery {
                sql: "SELECT id, name, count FROM items".to_string(),
                params: vec![],
                method: "all".to_string(),
            },
        )
        .await
        .unwrap();

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].columns, vec!["id", "name", "count"]);
        assert_eq!(rows[0].values[0], Value::String("1".to_string()));
        assert_eq!(rows[0].values[1], Value::String("widget".to_string()));
        assert_eq!(rows[0].values[2], Value::Number(5.into()));
    }

    #[tokio::test]
    async fn run_sql_run_returns_empty() {
        let pool = test_pool_with_table().await;
        let rows = run_sql(
            &pool,
            SqlQuery {
                sql: "INSERT INTO items (id, name, count) VALUES ('2', 'gadget', 3)".to_string(),
                params: vec![],
                method: "run".to_string(),
            },
        )
        .await
        .unwrap();
        assert!(rows.is_empty());

        let verify = run_sql(
            &pool,
            SqlQuery {
                sql: "SELECT COUNT(*) as cnt FROM items WHERE id = '2'".to_string(),
                params: vec![],
                method: "all".to_string(),
            },
        )
        .await
        .unwrap();
        assert_eq!(verify[0].values[0], Value::Number(1.into()));
    }

    #[tokio::test]
    async fn run_sql_batch_commits_all() {
        let pool = test_pool_with_table().await;
        let result = run_sql_batch(
            &pool,
            vec![
                SqlStatement {
                    sql: "INSERT INTO items (id, name, count) VALUES ('a', 'first', 1)".to_string(),
                    params: vec![],
                },
                SqlStatement {
                    sql: "INSERT INTO items (id, name, count) VALUES ('b', 'second', 2)".to_string(),
                    params: vec![],
                },
            ],
        )
        .await
        .unwrap();

        assert_eq!(result.rows_affected, 2);

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM items")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 2);
    }

    #[tokio::test]
    async fn run_sql_batch_rolls_back_on_failure() {
        let pool = test_pool_with_table().await;
        let result = run_sql_batch(
            &pool,
            vec![
                SqlStatement {
                    sql: "INSERT INTO items (id, name, count) VALUES ('c', 'valid', 1)".to_string(),
                    params: vec![],
                },
                SqlStatement {
                    sql: "INVALID SQL STATEMENT".to_string(),
                    params: vec![],
                },
            ],
        )
        .await;

        assert!(result.is_err());
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM items")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0, "Valid insert should have been rolled back");
    }

    #[tokio::test]
    async fn run_sql_parameterized_query_binds_values() {
        let pool = test_pool_with_table().await;
        run_sql(
            &pool,
            SqlQuery {
                sql: "INSERT INTO items (id, name, count) VALUES (?1, ?2, ?3)".to_string(),
                params: vec![Value::String("p1".to_string()), Value::String("param_item".to_string()), Value::Number(42.into())],
                method: "run".to_string(),
            },
        )
        .await
        .unwrap();

        let rows = run_sql(
            &pool,
            SqlQuery {
                sql: "SELECT id, name, count FROM items WHERE id = ?1".to_string(),
                params: vec![Value::String("p1".to_string())],
                method: "all".to_string(),
            },
        )
        .await
        .unwrap();

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].values[0], Value::String("p1".to_string()));
        assert_eq!(rows[0].values[1], Value::String("param_item".to_string()));
        assert_eq!(rows[0].values[2], Value::Number(42.into()));
    }
}
