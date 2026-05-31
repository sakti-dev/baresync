use crate::db::{DatabaseKey, DbExecutionResult, DbRow};
use crate::error::SyncError;
use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{params_from_iter, Connection};
use serde_json::Value;
use std::path::Path;
use std::thread;
use std::time::Duration;
use tokio::sync::{mpsc, oneshot};

const WORKER_QUEUE_CAPACITY: usize = 32;

#[derive(Clone)]
pub(crate) struct DbWorker {
    sender: mpsc::Sender<DbCommand>,
}

pub(crate) enum DbRequest {
    Execute {
        sql: String,
        params: Vec<Value>,
    },
    Query {
        sql: String,
        params: Vec<Value>,
    },
    Batch {
        statements: Vec<(String, Vec<Value>)>,
    },
    ApplyMigration {
        name: String,
        sql: String,
        strict: bool,
        created_at: i64,
    },
}

pub(crate) enum DbResponse {
    Execute(DbExecutionResult),
    Query(Vec<DbRow>),
}

struct DbCommand {
    request: DbRequest,
    reply: oneshot::Sender<Result<DbResponse, SyncError>>,
}

impl DbWorker {
    pub(crate) async fn connect(path: impl AsRef<Path>) -> Result<Self, SyncError> {
        Self::connect_with_encryption(path, None).await
    }

    pub(crate) async fn connect_with_encryption(
        path: impl AsRef<Path>,
        encryption_key: Option<DatabaseKey>,
    ) -> Result<Self, SyncError> {
        let path = path.as_ref().to_path_buf();
        let (sender, receiver) = mpsc::channel(WORKER_QUEUE_CAPACITY);
        let (ready_tx, ready_rx) = oneshot::channel();

        thread::spawn(move || match open_connection(&path, encryption_key) {
            Ok(conn) => {
                let _ = ready_tx.send(Ok(()));
                run_worker(conn, receiver);
            }
            Err(err) => {
                let _ = ready_tx.send(Err(err));
            }
        });

        ready_rx.await.map_err(|e| {
            SyncError::Database(format!("Failed to start database worker: {}", e))
        })??;

        Ok(Self { sender })
    }

    pub(crate) async fn execute(
        &self,
        sql: impl AsRef<str>,
        params: Vec<Value>,
    ) -> Result<DbExecutionResult, SyncError> {
        match self
            .call(DbRequest::Execute {
                sql: sql.as_ref().to_string(),
                params,
            })
            .await?
        {
            DbResponse::Execute(result) => Ok(result),
            DbResponse::Query(_) => Err(SyncError::Database(
                "Worker returned query response for execute request".to_string(),
            )),
        }
    }

    pub(crate) async fn query(
        &self,
        sql: impl AsRef<str>,
        params: Vec<Value>,
    ) -> Result<Vec<DbRow>, SyncError> {
        match self
            .call(DbRequest::Query {
                sql: sql.as_ref().to_string(),
                params,
            })
            .await?
        {
            DbResponse::Query(rows) => Ok(rows),
            DbResponse::Execute(_) => Err(SyncError::Database(
                "Worker returned execute response for query request".to_string(),
            )),
        }
    }

    pub(crate) async fn batch<S>(
        &self,
        statements: Vec<(S, Vec<Value>)>,
    ) -> Result<DbExecutionResult, SyncError>
    where
        S: AsRef<str>,
    {
        let statements = statements
            .into_iter()
            .map(|(sql, params)| (sql.as_ref().to_string(), params))
            .collect();

        match self.call(DbRequest::Batch { statements }).await? {
            DbResponse::Execute(result) => Ok(result),
            DbResponse::Query(_) => Err(SyncError::Database(
                "Worker returned query response for batch request".to_string(),
            )),
        }
    }

    pub(crate) async fn apply_migration(
        &self,
        name: impl AsRef<str>,
        sql: impl AsRef<str>,
        strict: bool,
        created_at: i64,
    ) -> Result<DbExecutionResult, SyncError> {
        match self
            .call(DbRequest::ApplyMigration {
                name: name.as_ref().to_string(),
                sql: sql.as_ref().to_string(),
                strict,
                created_at,
            })
            .await?
        {
            DbResponse::Execute(result) => Ok(result),
            DbResponse::Query(_) => Err(SyncError::Database(
                "Worker returned query response for migration request".to_string(),
            )),
        }
    }

    pub(crate) async fn submit(
        &self,
        request: DbRequest,
    ) -> Result<oneshot::Receiver<Result<DbResponse, SyncError>>, SyncError> {
        let (reply_tx, reply_rx) = oneshot::channel();
        self.sender
            .send(DbCommand {
                request,
                reply: reply_tx,
            })
            .await
            .map_err(|e| SyncError::Database(format!("Database worker stopped: {}", e)))?;
        Ok(reply_rx)
    }

    async fn call(&self, request: DbRequest) -> Result<DbResponse, SyncError> {
        let reply = self.submit(request).await?;
        reply
            .await
            .map_err(|e| SyncError::Database(format!("Database worker reply dropped: {}", e)))?
    }
}

fn run_worker(mut conn: Connection, mut receiver: mpsc::Receiver<DbCommand>) {
    while let Some(command) = receiver.blocking_recv() {
        let result = match command.request {
            DbRequest::Execute { sql, params } => {
                execute_sql(&mut conn, &sql, &params).map(DbResponse::Execute)
            }
            DbRequest::Query { sql, params } => {
                query_sql(&conn, &sql, &params).map(DbResponse::Query)
            }
            DbRequest::Batch { statements } => {
                batch_sql(&mut conn, &statements).map(DbResponse::Execute)
            }
            DbRequest::ApplyMigration {
                name,
                sql,
                strict,
                created_at,
            } => apply_migration_sql(&mut conn, &name, &sql, strict, created_at)
                .map(DbResponse::Execute),
        };

        let _ = command.reply.send(result);
    }
}

fn open_connection(
    path: &Path,
    encryption_key: Option<DatabaseKey>,
) -> Result<Connection, SyncError> {
    let database_existed = path.exists();
    let conn = Connection::open(path)
        .map_err(|e| SyncError::Database(format!("Failed to connect to DB: {}", e)))?;

    if let Some(key) = encryption_key {
        open_encrypted_connection(&conn, path, database_existed, &key)?;
    }

    conn.busy_timeout(Duration::from_secs(5))
        .map_err(|e| SyncError::Database(format!("Failed to set busy timeout: {}", e)))?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| SyncError::Database(format!("Failed to enable foreign keys: {}", e)))?;

    if path != Path::new(":memory:") {
        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(|e| SyncError::Database(format!("Failed to set journal mode: {}", e)))?;
    }

    conn.pragma_update(None, "synchronous", "NORMAL")
        .map_err(|e| SyncError::Database(format!("Failed to set synchronous mode: {}", e)))?;

    Ok(conn)
}

#[cfg(feature = "sqlcipher")]
fn open_encrypted_connection(
    conn: &Connection,
    path: &Path,
    database_existed: bool,
    key: &DatabaseKey,
) -> Result<(), SyncError> {
    conn.pragma_update(None, "hexkey", key.as_hex_key())
        .map_err(|e| {
            SyncError::Database(format!(
                "Failed to apply SQLCipher key to {}: {}",
                path.display(),
                e
            ))
        })?;

    conn.query_row("SELECT count(*) FROM sqlite_master", [], |row| row.get::<_, i64>(0))
        .map_err(|e| {
            let hint = if database_existed {
                "If this path previously contained a plaintext SQLite database, move, delete, or migrate it separately before enabling encryption."
            } else {
                "The database could not be validated after applying the SQLCipher key."
            };
            SyncError::Database(format!(
                "Failed to open encrypted database at {}: {} {}",
                path.display(),
                hint,
                e
            ))
        })?;

    Ok(())
}

#[cfg(not(feature = "sqlcipher"))]
fn open_encrypted_connection(
    _conn: &Connection,
    path: &Path,
    _database_existed: bool,
    _key: &DatabaseKey,
) -> Result<(), SyncError> {
    Err(SyncError::Database(format!(
        "SQLCipher support is disabled. Rebuild Baresync with the `sqlcipher` feature to open encrypted database {}.",
        path.display()
    )))
}

fn execute_sql(
    conn: &mut Connection,
    sql: &str,
    params: &[Value],
) -> Result<DbExecutionResult, SyncError> {
    let values = bind_values(params);
    let rows_affected =
        conn.execute(sql, params_from_iter(values))
            .map_err(|e| SyncError::Database(format!("Query failed: {}", e)))? as u64;

    Ok(DbExecutionResult {
        last_insert_id: conn.last_insert_rowid(),
        rows_affected,
    })
}

fn query_sql(conn: &Connection, sql: &str, params: &[Value]) -> Result<Vec<DbRow>, SyncError> {
    let values = bind_values(params);
    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| SyncError::Database(format!("Query failed: {}", e)))?;
    let columns = stmt
        .column_names()
        .into_iter()
        .map(|name| name.to_string())
        .collect::<Vec<_>>();

    let mut rows = Vec::new();
    let mapped = stmt
        .query_map(params_from_iter(values), |row| {
            let values = (0..row.as_ref().column_count())
                .map(|idx| value_ref_to_json(row.get_ref(idx)?))
                .collect::<Result<Vec<_>, rusqlite::Error>>()?;

            Ok(DbRow {
                columns: columns.clone(),
                values,
            })
        })
        .map_err(|e| SyncError::Database(format!("Query failed: {}", e)))?;

    for row in mapped {
        rows.push(row.map_err(|e| SyncError::Database(format!("Query failed: {}", e)))?);
    }

    Ok(rows)
}

fn batch_sql(
    conn: &mut Connection,
    statements: &[(String, Vec<Value>)],
) -> Result<DbExecutionResult, SyncError> {
    let tx = conn
        .transaction()
        .map_err(|e| SyncError::Database(format!("Failed to begin transaction: {}", e)))?;

    let mut last_insert_id = 0;
    let mut rows_affected = 0;

    for (sql, params) in statements {
        let values = bind_values(params);
        let affected = tx
            .execute(sql, params_from_iter(values))
            .map_err(|e| SyncError::Database(format!("Batch statement failed: {}", e)))?;
        rows_affected += affected as u64;
        last_insert_id = tx.last_insert_rowid();
    }

    tx.commit()
        .map_err(|e| SyncError::Database(format!("Failed to commit transaction: {}", e)))?;

    Ok(DbExecutionResult {
        last_insert_id,
        rows_affected,
    })
}

fn apply_migration_sql(
    conn: &mut Connection,
    name: &str,
    sql: &str,
    strict: bool,
    created_at: i64,
) -> Result<DbExecutionResult, SyncError> {
    let tx = conn
        .transaction()
        .map_err(|e| SyncError::Database(format!("Failed to begin transaction: {}", e)))?;

    let applied = {
        let mut stmt = tx
            .prepare("SELECT COUNT(*) FROM __drizzle_migrations WHERE hash = ?1")
            .map_err(|e| SyncError::Database(format!("Failed to check migration status: {}", e)))?;
        let count: i64 = stmt
            .query_row([name], |row| row.get(0))
            .map_err(|e| SyncError::Database(format!("Failed to check migration status: {}", e)))?;
        count > 0
    };

    if applied {
        tx.commit()
            .map_err(|e| SyncError::Database(format!("Failed to commit transaction: {}", e)))?;
        return Ok(DbExecutionResult {
            last_insert_id: conn.last_insert_rowid(),
            rows_affected: 0,
        });
    }

    let statements = split_migration_statements(sql);

    if strict {
        if sql.contains("--> statement-breakpoint") {
            for statement in &statements {
                tx.execute(statement, []).map_err(|e| {
                    SyncError::Database(format!("Migration {} failed: {}", name, e))
                })?;
            }
        } else if !sql.trim().is_empty() {
            tx.execute_batch(sql)
                .map_err(|e| SyncError::Database(format!("Migration {} failed: {}", name, e)))?;
        }
    } else {
        for statement in &statements {
            if let Err(e) = tx.execute(statement, []) {
                let msg = e.to_string();
                if msg.contains("already exists") || msg.contains("duplicate column") {
                    continue;
                }
                return Err(SyncError::Database(format!(
                    "Migration {} failed: {}",
                    name, e
                )));
            }
        }
    }

    let rows_affected = tx
        .execute(
            "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?1, ?2)",
            (name, created_at),
        )
        .map_err(|e| SyncError::Database(format!("Failed to record migration {}: {}", name, e)))?
        as u64;
    let last_insert_id = tx.last_insert_rowid();

    tx.commit()
        .map_err(|e| SyncError::Database(format!("Failed to commit transaction: {}", e)))?;

    Ok(DbExecutionResult {
        last_insert_id,
        rows_affected,
    })
}

fn split_migration_statements(sql: &str) -> Vec<String> {
    sql.split("--> statement-breakpoint")
        .map(str::trim)
        .filter(|stmt| !stmt.is_empty())
        .map(str::to_string)
        .collect()
}

fn bind_values(values: &[Value]) -> Vec<SqlValue> {
    values.iter().map(bind_value).collect()
}

fn bind_value(value: &Value) -> SqlValue {
    match value {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(i64::from(*b)),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                SqlValue::Integer(i)
            } else if let Some(f) = n.as_f64() {
                SqlValue::Real(f)
            } else {
                SqlValue::Null
            }
        }
        Value::String(s) => SqlValue::Text(s.clone()),
        Value::Array(_) | Value::Object(_) => {
            SqlValue::Text(serde_json::to_string(value).unwrap_or_default())
        }
    }
}

fn value_ref_to_json(value: ValueRef<'_>) -> Result<Value, rusqlite::Error> {
    Ok(match value {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(v) => Value::from(v),
        ValueRef::Real(v) => serde_json::Number::from_f64(v)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        ValueRef::Text(v) => Value::String(String::from_utf8_lossy(v).to_string()),
        ValueRef::Blob(v) => Value::String(format!("{}B", v.len())),
    })
}

#[cfg(test)]
mod tests {
    use super::{DbRequest, DbWorker};
    use serde_json::Value;

    async fn test_worker() -> DbWorker {
        DbWorker::connect(":memory:")
            .await
            .expect("worker should connect")
    }

    #[tokio::test]
    async fn worker_executes_serially_and_keeps_batch_atomic() {
        let worker = test_worker().await;

        worker
            .execute(
                "CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT NOT NULL)",
                vec![],
            )
            .await
            .expect("table should be created");

        let batch_worker = worker.clone();
        let batch = tokio::spawn(async move {
            batch_worker
                .batch(vec![
                    (
                        "INSERT INTO items (id, name) VALUES ('item-1', 'Coffee')",
                        vec![],
                    ),
                    (
                        "INSERT INTO items (id, name) VALUES ('item-2', 'Tea')",
                        vec![],
                    ),
                ])
                .await
        });

        let unrelated_worker = worker.clone();
        let unrelated = tokio::spawn(async move {
            unrelated_worker
                .execute(
                    "INSERT INTO items (id, name) VALUES ('item-3', 'Latte')",
                    vec![],
                )
                .await
        });

        batch
            .await
            .expect("batch task should join")
            .expect("batch should succeed");
        unrelated
            .await
            .expect("unrelated task should join")
            .expect("unrelated write should succeed");

        let rows = worker
            .query("SELECT id FROM items ORDER BY id", vec![])
            .await
            .expect("query should succeed");
        assert_eq!(rows.len(), 3);
    }

    #[tokio::test]
    async fn worker_reports_transaction_rollback_on_failure() {
        let worker = test_worker().await;
        worker
            .execute(
                "CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT NOT NULL)",
                vec![],
            )
            .await
            .expect("table should be created");

        let result = worker
            .batch(vec![
                (
                    "INSERT INTO items (id, name) VALUES ('item-1', 'Coffee')",
                    vec![],
                ),
                (
                    "INSERT INTO missing_table (id, name) VALUES ('item-2', 'Tea')",
                    vec![],
                ),
            ])
            .await;

        assert!(result.is_err());

        let rows = worker
            .query("SELECT id FROM items", vec![])
            .await
            .expect("query should succeed");
        assert!(rows.is_empty());
    }

    #[tokio::test]
    async fn worker_handles_dropped_reply_receiver() {
        let worker = test_worker().await;
        worker
            .execute("CREATE TABLE items (id TEXT PRIMARY KEY)", vec![])
            .await
            .expect("table should be created");

        let request = DbRequest::Execute {
            sql: "INSERT INTO items (id) VALUES ('item-1')".to_string(),
            params: vec![],
        };
        let reply = worker.submit(request);
        drop(reply);

        worker
            .execute("INSERT INTO items (id) VALUES ('item-2')", vec![])
            .await
            .expect("worker should keep processing after dropped reply");

        let rows = worker
            .query("SELECT id FROM items ORDER BY id", vec![])
            .await
            .expect("query should succeed");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].values[0], Value::String("item-2".to_string()));
    }

    #[tokio::test]
    async fn worker_preserves_parameter_types_and_metadata() {
        let worker = test_worker().await;
        worker
            .execute(
                "CREATE TABLE values_table (id INTEGER PRIMARY KEY AUTOINCREMENT, int_val INTEGER, real_val REAL, text_val TEXT, blob_val BLOB, null_val TEXT)",
                vec![],
            )
            .await
            .expect("table should be created");

        let result = worker
            .execute(
                "INSERT INTO values_table (int_val, real_val, text_val, blob_val, null_val) VALUES (?1, ?2, ?3, X'616263', NULL)",
                vec![
                    Value::from(7),
                    Value::from(3.5),
                    Value::String("hello".to_string()),
                ],
            )
            .await
            .expect("insert should succeed");

        assert_eq!(result.rows_affected, 1);
        assert_eq!(result.last_insert_id, 1);

        let rows = worker
            .query(
                "SELECT int_val, real_val, text_val, blob_val, null_val FROM values_table",
                vec![],
            )
            .await
            .expect("query should succeed");

        assert_eq!(rows[0].values[0], Value::from(7));
        assert_eq!(rows[0].values[1], Value::from(3.5));
        assert_eq!(rows[0].values[2], Value::String("hello".to_string()));
        assert_eq!(rows[0].values[3], Value::String("3B".to_string()));
        assert_eq!(rows[0].values[4], Value::Null);
    }
}
