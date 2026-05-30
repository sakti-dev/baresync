use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::db::{DbClient, DbRow};
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

pub async fn run_sql(db: &DbClient, query: SqlQuery) -> Result<Vec<SqlRow>, SyncError> {
    Ok(run_sql_execution(db, query).await?.rows)
}

#[derive(Debug)]
pub struct SqlExecutionResult {
    pub rows: Vec<SqlRow>,
    pub rows_affected: u64,
}

pub async fn run_sql_with_metadata(
    db: &DbClient,
    query: SqlQuery,
) -> Result<SqlExecutionResult, SyncError> {
    run_sql_execution(db, query).await
}

async fn run_sql_execution(
    db: &DbClient,
    query: SqlQuery,
) -> Result<SqlExecutionResult, SyncError> {
    if query.method == "run" {
        let result = db.execute(&query.sql, query.params).await?;
        return Ok(SqlExecutionResult {
            rows: vec![],
            rows_affected: result.rows_affected,
        });
    }

    let rows = db.query(&query.sql, query.params).await?;

    let result: Vec<SqlRow> = rows
        .into_iter()
        .map(|row: DbRow| SqlRow {
            columns: row.columns,
            values: row.values,
        })
        .collect();

    Ok(SqlExecutionResult {
        rows: result,
        rows_affected: 0,
    })
}

pub async fn run_sql_batch(
    db: &DbClient,
    statements: Vec<SqlStatement>,
) -> Result<BatchResult, SyncError> {
    let result = db
        .batch(
            statements
                .into_iter()
                .map(|stmt| (stmt.sql, stmt.params))
                .collect(),
        )
        .await?;

    Ok(BatchResult {
        last_insert_id: result.last_insert_id,
        rows_affected: result.rows_affected,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::DbClient;
    async fn test_pool() -> DbClient {
        DbClient::connect(":memory:").await.unwrap()
    }

    async fn test_pool_with_table() -> DbClient {
        let pool = test_pool().await;
        pool.execute(
            "CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0)",
            vec![],
        )
        .await
        .unwrap();
        pool
    }

    #[tokio::test]
    async fn run_sql_select_returns_rows() {
        let pool = test_pool_with_table().await;
        pool.execute(
            "INSERT INTO items (id, name, count) VALUES ('1', 'widget', 5)",
            vec![],
        )
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
    async fn run_sql_with_metadata_reports_rows_affected_for_writes_and_reads() {
        let pool = test_pool_with_table().await;

        let insert = run_sql_with_metadata(
            &pool,
            SqlQuery {
                sql: "INSERT INTO items (id, name, count) VALUES ('3', 'thing', 7)".to_string(),
                params: vec![],
                method: "run".to_string(),
            },
        )
        .await
        .unwrap();
        assert_eq!(insert.rows_affected, 1);
        assert!(insert.rows.is_empty());

        let select = run_sql_with_metadata(
            &pool,
            SqlQuery {
                sql: "SELECT id, name FROM items WHERE id = '3'".to_string(),
                params: vec![],
                method: "all".to_string(),
            },
        )
        .await
        .unwrap();
        assert_eq!(select.rows_affected, 0);
        assert_eq!(select.rows.len(), 1);

        let noop = run_sql_with_metadata(
            &pool,
            SqlQuery {
                sql: "UPDATE items SET name = 'missing' WHERE id = 'missing'".to_string(),
                params: vec![],
                method: "run".to_string(),
            },
        )
        .await
        .unwrap();
        assert_eq!(noop.rows_affected, 0);
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
                    sql: "INSERT INTO items (id, name, count) VALUES ('b', 'second', 2)"
                        .to_string(),
                    params: vec![],
                },
            ],
        )
        .await
        .unwrap();

        assert_eq!(result.rows_affected, 2);

        let count = count_rows(&pool, "SELECT COUNT(*) FROM items").await;
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
        let count = count_rows(&pool, "SELECT COUNT(*) FROM items").await;
        assert_eq!(count, 0, "Valid insert should have been rolled back");
    }

    #[tokio::test]
    async fn run_sql_parameterized_query_binds_values() {
        let pool = test_pool_with_table().await;
        run_sql(
            &pool,
            SqlQuery {
                sql: "INSERT INTO items (id, name, count) VALUES (?1, ?2, ?3)".to_string(),
                params: vec![
                    Value::String("p1".to_string()),
                    Value::String("param_item".to_string()),
                    Value::Number(42.into()),
                ],
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

    async fn count_rows(db: &DbClient, sql: &str) -> i64 {
        db.query(sql, vec![])
            .await
            .unwrap()
            .first()
            .and_then(|row| row.values.first())
            .and_then(|value| value.as_i64())
            .unwrap_or_default()
    }
}
