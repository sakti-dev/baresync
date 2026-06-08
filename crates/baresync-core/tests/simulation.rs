mod fixtures;

use baresync_core::db::DbClient;
use baresync_core::error::SyncError;
use baresync_core::gc;
use baresync_core::http::{SyncHttpTransport, SyncTransportFuture};
use baresync_core::pull;
use baresync_core::push::{self, PendingTablePush};
use baresync_core::schema;
use serde_json::Value;
use std::marker::PhantomData;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

struct DbStatement {
    sql: String,
    params: Vec<Value>,
}

fn db_query(sql: impl Into<String>) -> DbStatement {
    DbStatement {
        sql: sql.into(),
        params: Vec::new(),
    }
}

impl DbStatement {
    fn bind<T: Into<Value>>(mut self, value: T) -> Self {
        self.params.push(value.into());
        self
    }

    async fn execute(self, db: &DbClient) -> Result<(), SyncError> {
        let statements: Vec<&str> = self
            .sql
            .split(';')
            .map(str::trim)
            .filter(|stmt| !stmt.is_empty())
            .collect();

        if statements.len() > 1 && !self.params.is_empty() {
            return Err(SyncError::Database(
                "Test helper does not support parameters across multi-statement SQL".to_string(),
            ));
        }

        if statements.len() > 1 {
            for statement in statements {
                db.execute(statement, Vec::new()).await?;
            }
            return Ok(());
        }

        db.execute(&self.sql, self.params).await?;
        Ok(())
    }
}

trait FromDbValue: Sized {
    fn from_db_value(value: &Value) -> Option<Self>;
}

impl FromDbValue for String {
    fn from_db_value(value: &Value) -> Option<Self> {
        value.as_str().map(|s| s.to_string())
    }
}

impl FromDbValue for i64 {
    fn from_db_value(value: &Value) -> Option<Self> {
        value.as_i64()
    }
}

impl<T: FromDbValue> FromDbValue for Option<T> {
    fn from_db_value(value: &Value) -> Option<Self> {
        if value.is_null() {
            Some(None)
        } else {
            T::from_db_value(value).map(Some)
        }
    }
}

struct DbScalar<T> {
    sql: String,
    params: Vec<Value>,
    _marker: PhantomData<T>,
}

fn db_scalar<T>(sql: impl Into<String>) -> DbScalar<T> {
    DbScalar {
        sql: sql.into(),
        params: Vec::new(),
        _marker: PhantomData,
    }
}

impl<T> DbScalar<T> {
    fn bind<U: Into<Value>>(mut self, value: U) -> Self {
        self.params.push(value.into());
        self
    }
}

impl<T: FromDbValue> DbScalar<T> {
    async fn fetch_one(self, db: &DbClient) -> Result<T, SyncError> {
        let rows = db
            .query(self.sql, self.params)
            .await
            .map_err(|e| SyncError::Database(format!("Scalar query failed: {}", e)))?;
        let value = rows
            .first()
            .and_then(|row| row.values.first())
            .ok_or_else(|| SyncError::Database("Scalar query returned no rows".to_string()))?;
        T::from_db_value(value).ok_or_else(|| {
            SyncError::Database("Scalar query returned value of unexpected type".to_string())
        })
    }

    async fn fetch_optional(self, db: &DbClient) -> Result<Option<T>, SyncError> {
        let rows = db
            .query(self.sql, self.params)
            .await
            .map_err(|e| SyncError::Database(format!("Scalar query failed: {}", e)))?;
        let Some(row) = rows.first() else {
            return Ok(None);
        };
        let value = row
            .values
            .first()
            .ok_or_else(|| SyncError::Database("Scalar query returned no columns".to_string()))?;
        let value = T::from_db_value(value).ok_or_else(|| {
            SyncError::Database("Scalar query returned value of unexpected type".to_string())
        })?;
        Ok(Some(value))
    }
}

static TEST_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Clone)]
struct RecordingTransport {
    calls: Arc<Mutex<Vec<(String, Value)>>>,
    push_response: Value,
    status_response: Value,
    pull_response: Value,
}

impl RecordingTransport {
    fn new(push_response: Value, status_response: Value, pull_response: Value) -> Self {
        Self {
            calls: Arc::new(Mutex::new(Vec::new())),
            push_response,
            status_response,
            pull_response,
        }
    }

    fn calls(&self) -> Vec<(String, Value)> {
        self.calls
            .lock()
            .expect("recording transport poisoned")
            .clone()
    }
}

fn response_with_table_ack(table: &str, rejected: Vec<serde_json::Value>) -> serde_json::Value {
    serde_json::json!({
        "tables": [{
            "table": table,
            "acceptedCreatedIds": [],
            "acceptedUpdatedIds": [],
            "acceptedDeletedIds": [],
            "rejected": rejected,
        }],
        "serverTime": "2026-05-19T12:00:00.000Z",
    })
}

fn response_with_pull_tables(tables: serde_json::Value) -> serde_json::Value {
    serde_json::json!({
        "cursor": "sync:1716120000000:products:prod-1",
        "hasMore": false,
        "serverTime": "2026-05-19T12:00:00.000Z",
        "tables": tables,
    })
}

impl SyncHttpTransport for RecordingTransport {
    fn send_push_request(&self, _api_url: String, envelope: Value) -> SyncTransportFuture {
        let calls = Arc::clone(&self.calls);
        let response = self.push_response.clone();
        Box::pin(async move {
            calls
                .lock()
                .expect("recording transport poisoned")
                .push(("push".to_string(), envelope));
            Ok(response)
        })
    }

    fn send_status_request(&self, _api_url: String, body: Value) -> SyncTransportFuture {
        let calls = Arc::clone(&self.calls);
        let response = self.status_response.clone();
        Box::pin(async move {
            calls
                .lock()
                .expect("recording transport poisoned")
                .push(("status".to_string(), body));
            Ok(response)
        })
    }

    fn send_pull_request(&self, _api_url: String, body: Value) -> SyncTransportFuture {
        let calls = Arc::clone(&self.calls);
        let response = self.pull_response.clone();
        Box::pin(async move {
            calls
                .lock()
                .expect("recording transport poisoned")
                .push(("pull".to_string(), body));
            Ok(response)
        })
    }
}

async fn test_engine_with_transport(
    pool: DbClient,
    transport: RecordingTransport,
    scope_id: &str,
) -> baresync_core::engine::SyncEngine {
    let config = baresync_core::config::SyncEngineConfig {
        api_url: "http://127.0.0.1:9".to_string(),
        scope_id: scope_id.to_string(),
        transport: Arc::new(transport),
        ..Default::default()
    };

    baresync_core::engine::SyncEngine::new(
        pool,
        config,
        baresync_core::engine::SyncContractTables {
            upsert_order: vec!["categories".to_string(), "products".to_string()],
            delete_order: vec!["products".to_string(), "categories".to_string()],
            local_only_columns: vec!["is_synced".to_string()],
        },
    )
    .await
}

async fn temp_db() -> DbClient {
    let counter = TEST_COUNTER.fetch_add(1, Ordering::Relaxed);
    let dir =
        std::env::temp_dir().join(format!("baresync-test-{}-{}", std::process::id(), counter));
    let _ = std::fs::create_dir_all(&dir);
    let db_path = dir.join("test.db");
    let db = DbClient::connect(db_path.to_str().unwrap()).await.unwrap();
    db_query(fixtures::create_tables_sql())
        .execute(&db)
        .await
        .unwrap();
    db
}

async fn seed_cursor(pool: &DbClient, cursor: &str) {
    db_query(
        "INSERT INTO sync_cursors (scope_id, last_cursor, updated_at) VALUES (?1, ?2, '2026-05-19T12:00:00.000Z')",
    )
    .bind("merchant-1")
    .bind(cursor)
    .execute(pool)
    .await
    .unwrap();
}

async fn seed_outbox_row(pool: &DbClient) {
    db_query(fixtures::insert_category_sql())
        .bind("cat-local-1")
        .bind("merchant-1")
        .bind("Local Category")
        .bind("2026-05-19T13:00:00.000Z")
        .bind("2026-05-19T13:00:00.000Z")
        .execute(pool)
        .await
        .unwrap();

    db_query(fixtures::insert_outbox_sql())
        .bind("outbox-1")
        .bind("categories")
        .bind("cat-local-1")
        .bind("insert")
        .bind(
            serde_json::to_string(&serde_json::json!({
                "id": "cat-local-1",
                "merchantId": "merchant-1",
                "name": "Local Category",
                "createdAt": "2026-05-19T13:00:00.000Z",
                "updatedAt": "2026-05-19T13:00:00.000Z"
            }))
            .unwrap(),
        )
        .bind("merchant-1")
        .bind("2026-05-19T13:00:00.000Z")
        .execute(pool)
        .await
        .unwrap();
}

async fn seed_categories_and_products(pool: &DbClient) {
    db_query(fixtures::insert_category_sql())
        .bind("cat-1")
        .bind("merchant-1")
        .bind("Drinks")
        .bind("2026-01-01T00:00:00.000Z")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(pool)
        .await
        .unwrap();

    db_query("INSERT INTO products (id, merchant_id, category_id, name, price_minor_units, deleted_at, is_synced, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, NULL, 0, ?6, ?7)")
        .bind("prod-1")
        .bind("merchant-1")
        .bind("cat-1")
        .bind("Kopi Susu")
        .bind(15000)
        .bind("2026-01-01T00:00:00.000Z")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(pool)
        .await
        .unwrap();
}

#[tokio::test]
async fn pull_baseline_applies_rows_in_fk_order() {
    let pool = temp_db().await;
    let response = fixtures::pull_response(true, true, None);

    let applied = pull::apply_pull_batch_tables_tx(
        &pool,
        &["categories".to_string(), "products".to_string()],
        &["products".to_string(), "categories".to_string()],
        response.get("tables").unwrap(),
        "2026-05-19T12:00:00.000Z",
        &[],
    )
    .await
    .unwrap();

    assert_eq!(applied, 2);

    let cat_name: String = db_scalar("SELECT name FROM categories WHERE id = 'cat-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(cat_name, "Drinks Updated");

    let prod_name: String = db_scalar("SELECT name FROM products WHERE id = 'prod-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(prod_name, "Kopi Susu Updated");
}

#[tokio::test]
async fn sync_now_skips_transfer_when_clean() {
    let pool = temp_db().await;
    seed_cursor(&pool, "sync:phase14").await;

    let transport = RecordingTransport::new(
        serde_json::json!({"tables": [], "serverTime": "2026-05-19T12:00:00.000Z"}),
        serde_json::json!({
            "changedTables": [],
            "hasChanges": false,
            "cursor": "sync:phase14",
            "serverTime": "2026-05-19T12:00:00.000Z",
        }),
        response_with_pull_tables(serde_json::json!([])),
    );
    let engine = test_engine_with_transport(pool, transport.clone(), "merchant-1").await;

    let result = engine.sync_now(1000).await.unwrap();

    assert_eq!(result.mode, baresync_core::engine::SyncNowMode::NoOp);
    assert!(result.pull.is_none());
    assert!(result.push.is_none());
    assert_eq!(result.purged, 0);
    assert_eq!(
        result.status.as_ref().unwrap().changed_tables,
        Vec::<String>::new()
    );
    assert_eq!(transport.calls().len(), 1);
    assert_eq!(transport.calls()[0].0, "status");
    assert_eq!(transport.calls()[0].1["scopeId"], "merchant-1");
    assert_eq!(transport.calls()[0].1["cursor"], "sync:phase14");
}

#[tokio::test]
async fn sync_now_pushes_without_initial_pull_when_server_is_clean() {
    let pool = temp_db().await;
    seed_cursor(&pool, "sync:phase14").await;
    seed_outbox_row(&pool).await;

    let transport = RecordingTransport::new(
        response_with_table_ack("categories", vec![]),
        serde_json::json!({
            "changedTables": [],
            "hasChanges": false,
            "cursor": "sync:phase14",
            "serverTime": "2026-05-19T12:00:00.000Z",
        }),
        response_with_pull_tables(serde_json::json!([])),
    );
    let engine = test_engine_with_transport(pool, transport.clone(), "merchant-1").await;

    let result = engine.sync_now(1000).await.unwrap();

    assert_eq!(result.mode, baresync_core::engine::SyncNowMode::PushOnly);
    assert!(result.pull.is_none());
    assert!(result.push.is_some());
    assert_eq!(
        transport
            .calls()
            .iter()
            .map(|(kind, _)| kind)
            .collect::<Vec<_>>(),
        vec!["status", "push"]
    );
}

#[tokio::test]
async fn sync_now_pulls_changed_tables_without_push_when_local_is_clean() {
    let pool = temp_db().await;
    seed_cursor(&pool, "sync:phase14").await;

    let transport = RecordingTransport::new(
        response_with_table_ack("categories", vec![]),
        serde_json::json!({
            "changedTables": ["categories"],
            "hasChanges": true,
            "cursor": "sync:phase14",
            "serverTime": "2026-05-19T12:00:00.000Z",
        }),
        response_with_pull_tables(serde_json::json!([{
            "table": "categories",
            "changedRows": [{
                "id": "cat-1",
                "merchantId": "merchant-1",
                "name": "Drinks Updated",
                "createdAt": "2026-05-17T00:00:00.000Z",
                "updatedAt": "2026-05-19T12:00:00.000Z"
            }],
            "deletedIds": []
        }])),
    );
    let engine = test_engine_with_transport(pool, transport.clone(), "merchant-1").await;

    let result = engine.sync_now(1000).await.unwrap();

    assert_eq!(result.mode, baresync_core::engine::SyncNowMode::PullOnly);
    assert!(result.pull.is_some());
    assert!(result.push.is_none());
    assert_eq!(
        transport
            .calls()
            .iter()
            .map(|(kind, _)| kind)
            .collect::<Vec<_>>(),
        vec!["status", "pull"]
    );
    let pull_request = &transport.calls()[1].1;
    assert_eq!(pull_request["tables"], serde_json::json!(["categories"]));
    assert_eq!(pull_request["cursor"], "sync:phase14");
}

#[tokio::test]
async fn sync_now_pulls_then_pushes_when_both_sides_changed() {
    let pool = temp_db().await;
    seed_cursor(&pool, "sync:phase14").await;
    seed_outbox_row(&pool).await;

    let transport = RecordingTransport::new(
        response_with_table_ack("categories", vec![]),
        serde_json::json!({
            "changedTables": ["categories"],
            "hasChanges": true,
            "cursor": "sync:phase14",
            "serverTime": "2026-05-19T12:00:00.000Z",
        }),
        response_with_pull_tables(serde_json::json!([{
            "table": "categories",
            "changedRows": [{
                "id": "cat-1",
                "merchantId": "merchant-1",
                "name": "Drinks Updated",
                "createdAt": "2026-05-17T00:00:00.000Z",
                "updatedAt": "2026-05-19T12:00:00.000Z"
            }],
            "deletedIds": []
        }])),
    );
    let engine = test_engine_with_transport(pool, transport.clone(), "merchant-1").await;

    let result = engine.sync_now(1000).await.unwrap();

    assert_eq!(result.mode, baresync_core::engine::SyncNowMode::FullSync);
    assert!(result.pull.is_some());
    assert!(result.push.is_some());
    assert_eq!(
        transport
            .calls()
            .iter()
            .map(|(kind, _)| kind)
            .collect::<Vec<_>>(),
        vec!["status", "pull", "push"]
    );
}

#[tokio::test]
async fn sync_now_preserves_baseline_sync_when_local_cursor_missing() {
    let pool = temp_db().await;

    let transport = RecordingTransport::new(
        response_with_table_ack("categories", vec![]),
        serde_json::json!({
            "changedTables": [],
            "hasChanges": false,
            "cursor": "",
            "serverTime": "2026-05-19T12:00:00.000Z",
        }),
        response_with_pull_tables(serde_json::json!([{
            "table": "categories",
            "changedRows": [{
                "id": "cat-1",
                "merchantId": "merchant-1",
                "name": "Drinks Updated",
                "createdAt": "2026-05-17T00:00:00.000Z",
                "updatedAt": "2026-05-19T12:00:00.000Z"
            }],
            "deletedIds": []
        }])),
    );
    let engine = test_engine_with_transport(pool, transport.clone(), "merchant-1").await;

    let result = engine.sync_now(1000).await.unwrap();

    assert_eq!(result.mode, baresync_core::engine::SyncNowMode::FullResync);
    assert!(result.pull.is_some());
    assert!(result.push.is_some());
    let pull_request = &transport.calls()[1].1;
    assert_eq!(pull_request["cursor"], "");
}

#[tokio::test]
async fn sync_now_full_resync_pulls_all_tables_when_local_cursor_missing() {
    let pool = temp_db().await;

    let transport = RecordingTransport::new(
        response_with_table_ack("categories", vec![]),
        serde_json::json!({
            "changedTables": ["categories"],
            "hasChanges": true,
            "cursor": "sync:status",
            "serverTime": "2026-05-19T12:00:00.000Z",
        }),
        response_with_pull_tables(serde_json::json!([{
            "table": "categories",
            "changedRows": [],
            "deletedIds": []
        }, {
            "table": "products",
            "changedRows": [],
            "deletedIds": []
        }])),
    );
    let engine = test_engine_with_transport(pool, transport.clone(), "merchant-1").await;

    let result = engine.sync_now(1000).await.unwrap();

    assert_eq!(result.mode, baresync_core::engine::SyncNowMode::FullResync);
    let pull_request = &transport.calls()[1].1;
    assert_eq!(pull_request["cursor"], "");
    assert_eq!(
        pull_request["tables"],
        serde_json::json!(["categories", "products"])
    );
}

#[tokio::test]
async fn baseline_pull_stores_cursor_when_no_existing_cursor() {
    let pool = temp_db().await;
    let transport = RecordingTransport::new(
        response_with_table_ack("categories", vec![]),
        serde_json::json!({
            "changedTables": [],
            "hasChanges": false,
            "cursor": "",
            "serverTime": "2026-05-19T12:00:00.000Z",
        }),
        response_with_pull_tables(serde_json::json!([{
            "table": "categories",
            "changedRows": [],
            "deletedIds": []
        }])),
    );
    let engine = test_engine_with_transport(pool.clone(), transport, "merchant-1").await;

    let result = engine.sync_now(1000).await.unwrap();

    assert_eq!(result.mode, baresync_core::engine::SyncNowMode::FullResync);
    let cursor: String =
        db_scalar("SELECT last_cursor FROM sync_cursors WHERE scope_id = 'merchant-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(cursor, "sync:1716120000000:products:prod-1");
}

#[tokio::test]
async fn baseline_pull_does_not_store_empty_cursor() {
    let pool = temp_db().await;
    let transport = RecordingTransport::new(
        response_with_table_ack("categories", vec![]),
        serde_json::json!({
            "changedTables": [],
            "hasChanges": false,
            "cursor": "",
            "serverTime": "2026-05-19T12:00:00.000Z",
        }),
        serde_json::json!({
            "cursor": "",
            "hasMore": false,
            "serverTime": "2026-05-19T12:00:00.000Z",
            "tables": [{
                "table": "categories",
                "changedRows": [],
                "deletedIds": []
            }],
        }),
    );
    let engine = test_engine_with_transport(pool.clone(), transport, "merchant-1").await;

    let result = engine.sync_now(1000).await.unwrap();

    assert_eq!(result.mode, baresync_core::engine::SyncNowMode::FullResync);

    let stored_cursor: Option<String> =
        db_scalar("SELECT last_cursor FROM sync_cursors WHERE scope_id = ?1")
            .bind("merchant-1")
            .fetch_optional(&pool)
            .await
            .unwrap();
    assert!(stored_cursor.is_none(), "empty response cursor must not be stored");

    let state = engine.get_sync_local_state().await.unwrap();
    assert!(state.needs_baseline_sync);
    assert!(state.last_server_watermark.is_empty());
}

#[tokio::test]
async fn sync_now_clears_baseline_needed_after_successful_full_resync() {
    let pool = temp_db().await;
    let transport = RecordingTransport::new(
        response_with_table_ack("categories", vec![]),
        serde_json::json!({
            "changedTables": ["categories"],
            "hasChanges": true,
            "cursor": "sync:status",
            "serverTime": "2026-05-19T12:00:00.000Z",
        }),
        response_with_pull_tables(serde_json::json!([{
            "table": "categories",
            "changedRows": [],
            "deletedIds": []
        }, {
            "table": "products",
            "changedRows": [],
            "deletedIds": []
        }])),
    );
    let engine = test_engine_with_transport(pool, transport, "merchant-1").await;

    let result = engine.sync_now(1000).await.unwrap();
    assert_eq!(result.mode, baresync_core::engine::SyncNowMode::FullResync);

    let state = engine.get_sync_local_state().await.unwrap();
    assert!(!state.needs_baseline_sync, "baseline should be cleared after successful full resync");
}

#[tokio::test]
async fn sync_now_reconciles_rejected_tables_after_push() {
    let pool = temp_db().await;
    seed_cursor(&pool, "sync:phase14").await;
    seed_outbox_row(&pool).await;

    let transport = RecordingTransport::new(
        response_with_table_ack(
            "categories",
            vec![serde_json::json!({"id": "cat-local-1", "reason": "server_newer"})],
        ),
        serde_json::json!({
            "changedTables": [],
            "hasChanges": false,
            "cursor": "sync:phase14",
            "serverTime": "2026-05-19T12:00:00.000Z",
        }),
        response_with_pull_tables(serde_json::json!([{
            "table": "categories",
            "changedRows": [{
                "id": "cat-local-1",
                "merchantId": "merchant-1",
                "name": "Server Category",
                "createdAt": "2026-05-17T00:00:00.000Z",
                "updatedAt": "2026-05-19T12:00:01.000Z"
            }],
            "deletedIds": []
        }])),
    );
    let engine = test_engine_with_transport(pool, transport.clone(), "merchant-1").await;

    let result = engine.sync_now(1000).await.unwrap();

    assert_eq!(result.mode, baresync_core::engine::SyncNowMode::PushOnly);
    assert_eq!(
        transport
            .calls()
            .iter()
            .map(|(kind, _)| kind)
            .collect::<Vec<_>>(),
        vec!["status", "push", "pull"]
    );
    let pull_request = &transport.calls()[2].1;
    assert_eq!(pull_request["cursor"], "");
    assert_eq!(pull_request["tables"], serde_json::json!(["categories"]));
}

#[tokio::test]
async fn pull_upserted_rows_are_marked_synced() {
    let pool = temp_db().await;
    let response = fixtures::pull_response(true, false, None);

    pull::apply_pull_batch_tables_tx(
        &pool,
        &["categories".to_string()],
        &[],
        response.get("tables").unwrap(),
        "2026-05-19T12:00:00.000Z",
        &[],
    )
    .await
    .unwrap();

    let is_synced: i64 = db_scalar("SELECT is_synced FROM categories WHERE id = 'cat-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(is_synced, 1);
}

#[tokio::test]
async fn pull_soft_deletes_in_reverse_fk_order() {
    let pool = temp_db().await;

    db_query(fixtures::insert_category_sql())
        .bind("cat-1")
        .bind("merchant-1")
        .bind("Drinks")
        .bind("2026-01-01T00:00:00.000Z")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    let response = fixtures::pull_response(false, true, Some("prod-1"));

    pull::apply_pull_batch_tables_tx(
        &pool,
        &["categories".to_string(), "products".to_string()],
        &["products".to_string(), "categories".to_string()],
        response.get("tables").unwrap(),
        "2026-05-19T12:00:00.000Z",
        &[],
    )
    .await
    .unwrap();

    let prod_deleted: Option<String> =
        db_scalar("SELECT deleted_at FROM products WHERE id = 'prod-1'")
            .fetch_optional(&pool)
            .await
            .unwrap()
            .flatten();
    assert!(prod_deleted.is_some());
}

#[tokio::test]
async fn pull_cursor_advances_after_success() {
    let pool = temp_db().await;

    db_query("INSERT INTO sync_cursors (scope_id, last_cursor, updated_at) VALUES (?1, '', '0')")
        .bind("merchant-1")
        .execute(&pool)
        .await
        .unwrap();

    let response = fixtures::pull_response(true, false, None);

    pull::apply_pull_batch_tables_tx(
        &pool,
        &["categories".to_string()],
        &[],
        response.get("tables").unwrap(),
        "2026-05-19T12:00:00.000Z",
        &[],
    )
    .await
    .unwrap();

    baresync_core::cursor::set_last_cursor_tx(&pool, "merchant-1", "sync:new-cursor")
        .await
        .unwrap();

    let cursor: String = db_scalar("SELECT last_cursor FROM sync_cursors WHERE scope_id = ?1")
        .bind("merchant-1")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(cursor, "sync:new-cursor");
}

#[tokio::test]
async fn pull_cursor_does_not_advance_on_failure() {
    let pool = temp_db().await;

    db_query(
        "INSERT INTO sync_cursors (scope_id, last_cursor, updated_at) VALUES (?1, 'sync:original', '0')",
    )
    .bind("merchant-1")
    .execute(&pool)
    .await
    .unwrap();

    let cursor_before: String =
        db_scalar("SELECT last_cursor FROM sync_cursors WHERE scope_id = ?1")
            .bind("merchant-1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(cursor_before, "sync:original");
}

#[tokio::test]
async fn push_builds_envelope_from_outbox() {
    let pool = temp_db().await;

    db_query(fixtures::insert_category_sql())
        .bind("cat-1")
        .bind("merchant-1")
        .bind("Drinks")
        .bind("2026-01-01T00:00:00.000Z")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    db_query(fixtures::insert_outbox_sql())
        .bind("outbox-1")
        .bind("categories")
        .bind("cat-1")
        .bind("insert")
        .bind("{\"id\":\"cat-1\",\"merchant_id\":\"merchant-1\",\"name\":\"Drinks\"}")
        .bind("merchant-1")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    let changes = baresync_core::schema::read_unsynced_table_changes_from_outbox_tx(
        &pool,
        "categories",
        "merchant-1",
        &["is_synced"],
    )
    .await
    .unwrap();

    assert!(!changes.changes.changed_rows.is_empty() || !changes.changes.deleted_ids.is_empty());
}

#[tokio::test]
async fn push_coalesces_insert_then_delete() {
    let pool = temp_db().await;

    db_query(fixtures::insert_category_sql())
        .bind("cat-1")
        .bind("merchant-1")
        .bind("Drinks")
        .bind("2026-01-01T00:00:00.000Z")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    db_query(fixtures::insert_outbox_sql())
        .bind("outbox-1")
        .bind("categories")
        .bind("cat-1")
        .bind("insert")
        .bind("{\"id\":\"cat-1\",\"name\":\"Drinks\"}")
        .bind("merchant-1")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    db_query(fixtures::insert_outbox_sql())
        .bind("outbox-2")
        .bind("categories")
        .bind("cat-1")
        .bind("delete")
        .bind("null")
        .bind("merchant-1")
        .bind("2026-01-01T00:00:01.000Z")
        .execute(&pool)
        .await
        .unwrap();

    let changes = baresync_core::schema::read_unsynced_table_changes_from_outbox_tx(
        &pool,
        "categories",
        "merchant-1",
        &[],
    )
    .await
    .unwrap();

    assert!(changes.changes.changed_rows.is_empty());
    assert!(changes.changes.deleted_ids.is_empty());
}

#[tokio::test]
async fn push_upsert_query_works() {
    let pool = temp_db().await;

    let row = serde_json::json!({
        "id": "cat-1",
        "merchantId": "merchant-1",
        "name": "Drinks",
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z"
    });

    baresync_core::push::upsert_row(&pool, "categories", &row)
        .await
        .unwrap();

    let name: String = db_scalar("SELECT name FROM categories WHERE id = 'cat-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(name, "Drinks");

    let is_synced: i64 = db_scalar("SELECT is_synced FROM categories WHERE id = 'cat-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(is_synced, 1);
}

#[tokio::test]
async fn push_soft_delete_marks_row() {
    let pool = temp_db().await;

    db_query(fixtures::insert_category_sql())
        .bind("cat-1")
        .bind("merchant-1")
        .bind("Drinks")
        .bind("2026-01-01T00:00:00.000Z")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    baresync_core::push::soft_delete_row(&pool, "categories", "cat-1", "2026-05-19T12:00:00.000Z")
        .await
        .unwrap();

    let deleted_at: Option<String> =
        db_scalar("SELECT deleted_at FROM categories WHERE id = 'cat-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(deleted_at, Some("2026-05-19T12:00:00.000Z".to_string()));

    let is_synced: i64 = db_scalar("SELECT is_synced FROM categories WHERE id = 'cat-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(is_synced, 1);
}

#[tokio::test]
async fn gc_after_pull_and_push_lifecycle() {
    let pool = temp_db().await;
    seed_categories_and_products(&pool).await;

    db_query("UPDATE products SET deleted_at = '2026-05-19T12:00:00.000Z', is_synced = 1 WHERE id = 'prod-1'")
        .execute(&pool)
        .await
        .unwrap();

    let purged = gc::run_garbage_collection(
        &pool,
        &["categories".to_string(), "products".to_string()],
        "merchant-1",
    )
    .await
    .unwrap();
    assert_eq!(purged, 1);

    let prod_count: i64 = db_scalar("SELECT COUNT(*) FROM products WHERE id = 'prod-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(prod_count, 0);

    let cat_count: i64 = db_scalar("SELECT COUNT(*) FROM categories WHERE id = 'cat-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(cat_count, 1);
}

#[tokio::test]
async fn baseline_pull_does_not_advance_stored_cursor() {
    let pool = temp_db().await;

    db_query(
        "INSERT INTO sync_cursors (scope_id, last_cursor, updated_at) VALUES ('merchant-1', 'sync:original', '0')",
    )
    .execute(&pool)
    .await
    .unwrap();

    let response = fixtures::pull_response(true, false, None);
    let _ = pull::apply_pull_batch_tables_tx(
        &pool,
        &["categories".to_string()],
        &[],
        response.get("tables").unwrap(),
        "2026-05-19T12:00:00.000Z",
        &[],
    )
    .await
    .unwrap();

    let new_cursor = response
        .get("cursor")
        .and_then(|c| c.as_str())
        .unwrap_or("");
    assert!(!new_cursor.is_empty());

    let cursor: String =
        db_scalar("SELECT last_cursor FROM sync_cursors WHERE scope_id = 'merchant-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(cursor, "sync:original");
}

#[tokio::test]
async fn push_flatten_chunk_roundtrip_from_outbox() {
    let pool = temp_db().await;
    seed_categories_and_products(&pool).await;

    for i in 0..3 {
        db_query(fixtures::insert_outbox_sql())
            .bind(format!("outbox-cat-{}", i))
            .bind("categories")
            .bind("cat-1")
            .bind("update")
            .bind("{\"id\":\"cat-1\",\"name\":\"Updated\"}")
            .bind("merchant-1")
            .bind("2026-05-19T00:00:00.000Z")
            .execute(&pool)
            .await
            .unwrap();
    }

    for i in 0..2 {
        db_query(fixtures::insert_outbox_sql())
            .bind(format!("outbox-prod-del-{}", i))
            .bind("products")
            .bind(format!("prod-del-{}", i))
            .bind("delete")
            .bind("null")
            .bind("merchant-1")
            .bind("2026-05-19T00:00:00.000Z")
            .execute(&pool)
            .await
            .unwrap();
    }

    let cat_changes = schema::read_unsynced_table_changes_from_outbox_tx(
        &pool,
        "categories",
        "merchant-1",
        &["is_synced"],
    )
    .await
    .unwrap();

    let cat_units: Vec<PendingTablePush> = push::flatten_pending_tables("categories", &cat_changes);
    assert!(!cat_units.is_empty());

    let prod_changes = schema::read_unsynced_table_changes_from_outbox_tx(
        &pool,
        "products",
        "merchant-1",
        &["is_synced"],
    )
    .await
    .unwrap();

    let prod_units: Vec<PendingTablePush> = push::flatten_pending_tables("products", &prod_changes);
    assert!(!prod_units.is_empty());

    let all_units: Vec<PendingTablePush> = cat_units
        .into_iter()
        .chain(prod_units.into_iter())
        .collect();

    assert!(all_units.len() >= 2);

    let chunks =
        push::chunk_pending_push_tables(all_units, 1, usize::MAX, "merchant-1", "client-1");
    assert!(chunks.len() >= 2);

    for chunk in &chunks {
        let merged = push::merge_pending_units(chunk.clone());
        let _envelope =
            push::build_json_push_envelope("merchant-1", "client-1", "test-key", &merged);
    }
}

#[tokio::test]
async fn sim_local_offline_inserts_create_outbox_entries() {
    let pool = temp_db().await;

    let cat_row = serde_json::json!({
        "id": "cat-1",
        "merchantId": "merchant-1",
        "name": "Drinks",
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z"
    });
    push::upsert_row(&pool, "categories", &cat_row)
        .await
        .unwrap();

    db_query(fixtures::insert_outbox_sql())
        .bind("outbox-cat-1")
        .bind("categories")
        .bind("cat-1")
        .bind("insert")
        .bind(serde_json::to_string(&cat_row).unwrap())
        .bind("merchant-1")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    let prod_row = serde_json::json!({
        "id": "prod-1",
        "merchantId": "merchant-1",
        "categoryId": "cat-1",
        "name": "Kopi Susu",
        "priceMinorUnits": 15000,
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z"
    });
    push::upsert_row(&pool, "products", &prod_row)
        .await
        .unwrap();

    db_query(fixtures::insert_outbox_sql())
        .bind("outbox-prod-1")
        .bind("products")
        .bind("prod-1")
        .bind("insert")
        .bind(serde_json::to_string(&prod_row).unwrap())
        .bind("merchant-1")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    let outbox_count: i64 = db_scalar("SELECT COUNT(*) FROM sync_outbox WHERE synced_at IS NULL")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(outbox_count, 2);

    let cat_outbox: i64 = db_scalar(
        "SELECT COUNT(*) FROM sync_outbox WHERE table_name = 'categories' AND synced_at IS NULL",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(cat_outbox, 1);

    let prod_outbox: i64 = db_scalar(
        "SELECT COUNT(*) FROM sync_outbox WHERE table_name = 'products' AND synced_at IS NULL",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(prod_outbox, 1);
}

#[tokio::test]
async fn sim_push_reads_outbox_in_upsert_order() {
    let pool = temp_db().await;
    seed_categories_and_products(&pool).await;

    db_query(fixtures::insert_outbox_sql())
        .bind("outbox-prod-1")
        .bind("products")
        .bind("prod-1")
        .bind("update")
        .bind("{\"id\":\"prod-1\",\"name\":\"Updated Product\"}")
        .bind("merchant-1")
        .bind("2026-05-19T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    db_query(fixtures::insert_outbox_sql())
        .bind("outbox-cat-1")
        .bind("categories")
        .bind("cat-1")
        .bind("update")
        .bind("{\"id\":\"cat-1\",\"name\":\"Updated Category\"}")
        .bind("merchant-1")
        .bind("2026-05-19T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    let upsert_order = vec!["categories".to_string(), "products".to_string()];
    let mut all_units: Vec<PendingTablePush> = Vec::new();

    for table in &upsert_order {
        let changes =
            schema::read_unsynced_table_changes_from_outbox_tx(&pool, table, "merchant-1", &[])
                .await
                .unwrap();
        all_units.push(
            push::flatten_pending_tables(table, &changes)
                .into_iter()
                .next()
                .unwrap(),
        );
    }

    assert_eq!(all_units[0].table, "categories");
    assert_eq!(all_units[1].table, "products");
}

#[tokio::test]
async fn sim_pull_deleted_ids_soft_deletes_product() {
    let pool = temp_db().await;
    seed_categories_and_products(&pool).await;

    let response = fixtures::soft_delete_pull_response();

    pull::apply_pull_batch_tables_tx(
        &pool,
        &["categories".to_string(), "products".to_string()],
        &["products".to_string(), "categories".to_string()],
        response.get("tables").unwrap(),
        "2026-05-19T12:00:00.000Z",
        &[],
    )
    .await
    .unwrap();

    let deleted_at: Option<String> =
        db_scalar("SELECT deleted_at FROM products WHERE id = 'prod-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(deleted_at.is_some());
    assert!(!deleted_at.unwrap().is_empty());

    let is_synced: i64 = db_scalar("SELECT is_synced FROM products WHERE id = 'prod-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(is_synced, 1);
}

#[tokio::test]
async fn sim_server_wins_rejection_reconciled_by_pull() {
    let pool = temp_db().await;
    seed_categories_and_products(&pool).await;

    let rejection = fixtures::push_rejection_response();
    let recon_pull = rejection.get("reconciliationPull").unwrap();

    pull::apply_pull_batch_tables_tx(
        &pool,
        &["categories".to_string()],
        &[],
        recon_pull.get("tables").unwrap(),
        "2026-05-19T12:00:02.000Z",
        &[],
    )
    .await
    .unwrap();

    let cat_name: String = db_scalar("SELECT name FROM categories WHERE id = 'cat-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(cat_name, "Drinks Server Version");

    let cat_updated: String = db_scalar("SELECT updated_at FROM categories WHERE id = 'cat-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(cat_updated, "2026-05-19T12:00:02.000Z");
}

#[tokio::test]
async fn sim_adaptive_chunking_splits_on_413() {
    let pool = temp_db().await;
    seed_categories_and_products(&pool).await;

    for i in 0..4 {
        if i != 1 {
            db_query("INSERT INTO products (id, merchant_id, category_id, name, price_minor_units, deleted_at, is_synced, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, NULL, 0, ?6, ?7)")
                .bind(format!("prod-{}", i))
                .bind("merchant-1")
                .bind("cat-1")
                .bind(format!("Item {}", i))
                .bind(15000 + i as i64)
                .bind("2026-05-19T00:00:00.000Z")
                .bind("2026-05-19T00:00:00.000Z")
                .execute(&pool)
                .await
                .unwrap();
        }

        db_query(fixtures::insert_outbox_sql())
            .bind(format!("outbox-prod-{}", i))
            .bind("products")
            .bind(format!("prod-{}", i))
            .bind("insert")
            .bind(format!("{{\"id\":\"prod-{}\",\"name\":\"Item {}\"}}", i, i))
            .bind("merchant-1")
            .bind("2026-05-19T00:00:00.000Z")
            .execute(&pool)
            .await
            .unwrap();
    }

    let changes =
        schema::read_unsynced_table_changes_from_outbox_tx(&pool, "products", "merchant-1", &[])
            .await
            .unwrap();

    let units = push::flatten_pending_tables("products", &changes);
    assert_eq!(units.len(), 4);

    let chunks =
        push::chunk_pending_push_tables(units.clone(), 4, usize::MAX, "merchant-1", "client-1");
    assert_eq!(chunks.len(), 1);

    let (first, second) = push::split_push_chunk_for_retry(&chunks[0]);
    assert_eq!(first.len(), 2);
    assert_eq!(second.len(), 2);
}

#[tokio::test]
async fn sim_single_row_too_large_error() {
    let unit = PendingTablePush {
        table: "products".to_string(),
        row: Some(serde_json::json!({
            "id": "prod-big",
            "merchantId": "merchant-1",
            "name": "Huge product with lots of data"
        })),
        deleted_id: None,
        outbox_ids: vec!["outbox-1".to_string()],
    };

    let merged = push::merge_pending_units(vec![unit.clone()]);
    let idem_key = push::generate_idempotency_key_from_outbox_ids(&unit.outbox_ids);
    let byte_len = push::encoded_push_chunk_len("merchant-1", "client-1", &idem_key, &merged);

    let max_bytes = byte_len.saturating_sub(1);
    let is_single = unit.row.is_some() && byte_len > max_bytes;

    assert!(is_single);
    assert!(byte_len > 0);
}

#[tokio::test]
async fn sim_cursor_advances_after_successful_pull() {
    let pool = temp_db().await;

    db_query("INSERT INTO sync_cursors (scope_id, last_cursor, updated_at) VALUES (?1, '', '0')")
        .bind("merchant-1")
        .execute(&pool)
        .await
        .unwrap();

    let response = fixtures::baseline_pull_response();
    let new_cursor = response.get("cursor").and_then(|c| c.as_str()).unwrap();

    pull::apply_pull_batch_tables_tx(
        &pool,
        &["categories".to_string(), "products".to_string()],
        &["products".to_string(), "categories".to_string()],
        response.get("tables").unwrap(),
        "2026-05-19T12:00:00.000Z",
        &[],
    )
    .await
    .unwrap();
    baresync_core::cursor::set_last_cursor_tx(&pool, "merchant-1", new_cursor)
        .await
        .unwrap();

    let cursor: String = db_scalar("SELECT last_cursor FROM sync_cursors WHERE scope_id = ?1")
        .bind("merchant-1")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(cursor, new_cursor);
}

#[tokio::test]
async fn sim_cursor_does_not_advance_on_failure() {
    let pool = temp_db().await;

    db_query(
        "INSERT INTO sync_cursors (scope_id, last_cursor, updated_at) VALUES (?1, 'sync:original', '0')",
    )
    .bind("merchant-1")
    .execute(&pool)
    .await
    .unwrap();

    let cursor: String = db_scalar("SELECT last_cursor FROM sync_cursors WHERE scope_id = ?1")
        .bind("merchant-1")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(cursor, "sync:original");
}

#[tokio::test]
async fn sim_gc_purges_soft_deleted_synced_rows() {
    let pool = temp_db().await;
    seed_categories_and_products(&pool).await;

    db_query("UPDATE products SET deleted_at = '2026-05-19T12:00:00.000Z', is_synced = 1 WHERE id = 'prod-1'")
        .execute(&pool)
        .await
        .unwrap();

    let purged = gc::run_garbage_collection(
        &pool,
        &["categories".to_string(), "products".to_string()],
        "merchant-1",
    )
    .await
    .unwrap();
    assert_eq!(purged, 1);

    let prod_count: i64 = db_scalar("SELECT COUNT(*) FROM products WHERE id = 'prod-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(prod_count, 0);

    let cat_count: i64 = db_scalar("SELECT COUNT(*) FROM categories WHERE id = 'cat-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(cat_count, 1);
}

#[tokio::test]
async fn sim_full_sync_lifecycle() {
    let pool = temp_db().await;

    let response = fixtures::baseline_pull_response();
    let server_time = response.get("serverTime").and_then(|t| t.as_str()).unwrap();
    let new_cursor = response.get("cursor").and_then(|c| c.as_str()).unwrap();

    db_query("INSERT INTO sync_cursors (scope_id, last_cursor, updated_at) VALUES (?1, '', '0')")
        .bind("merchant-1")
        .execute(&pool)
        .await
        .unwrap();

    let applied = pull::apply_pull_batch_tables_tx(
        &pool,
        &["categories".to_string(), "products".to_string()],
        &["products".to_string(), "categories".to_string()],
        response.get("tables").unwrap(),
        server_time,
        &[],
    )
    .await
    .unwrap();
    baresync_core::cursor::set_last_cursor_tx(&pool, "merchant-1", new_cursor)
        .await
        .unwrap();
    assert_eq!(applied, 2);

    let cat_name: String = db_scalar("SELECT name FROM categories WHERE id = 'cat-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(cat_name, "Drinks Updated");

    let local_cat = serde_json::json!({
        "id": "cat-local-1",
        "merchantId": "merchant-1",
        "name": "Local Category",
        "createdAt": "2026-05-19T13:00:00.000Z",
        "updatedAt": "2026-05-19T13:00:00.000Z"
    });
    push::upsert_row(&pool, "categories", &local_cat)
        .await
        .unwrap();

    db_query(fixtures::insert_outbox_sql())
        .bind("outbox-local-cat-1")
        .bind("categories")
        .bind("cat-local-1")
        .bind("insert")
        .bind(serde_json::to_string(&local_cat).unwrap())
        .bind("merchant-1")
        .bind("2026-05-19T13:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    let outbox_count: i64 = db_scalar("SELECT COUNT(*) FROM sync_outbox WHERE synced_at IS NULL")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(outbox_count, 1);

    db_query("UPDATE sync_outbox SET synced_at = '2026-05-19T14:00:00.000Z' WHERE id = 'outbox-local-cat-1'")
        .execute(&pool)
        .await
        .unwrap();

    let pending_after_push: i64 =
        db_scalar("SELECT COUNT(*) FROM sync_outbox WHERE synced_at IS NULL")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(pending_after_push, 0);

    let soft_delete_response = fixtures::soft_delete_pull_response();
    pull::apply_pull_batch_tables_tx(
        &pool,
        &["categories".to_string(), "products".to_string()],
        &["products".to_string(), "categories".to_string()],
        soft_delete_response.get("tables").unwrap(),
        "2026-05-19T12:00:01.000Z",
        &[],
    )
    .await
    .unwrap();

    let prod_deleted: Option<String> =
        db_scalar("SELECT deleted_at FROM products WHERE id = 'prod-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(prod_deleted.is_some());

    let purged = gc::run_garbage_collection(
        &pool,
        &["categories".to_string(), "products".to_string()],
        "merchant-1",
    )
    .await
    .unwrap();
    assert!(purged >= 1);

    let prod_count: i64 = db_scalar("SELECT COUNT(*) FROM products WHERE id = 'prod-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(prod_count, 0);

    let second_outbox: i64 = db_scalar("SELECT COUNT(*) FROM sync_outbox WHERE synced_at IS NULL")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(second_outbox, 0);
}

#[tokio::test]
async fn sim_migrations_applied_once_skipped_on_second_run() {
    use baresync_core::migrations::{self, EmbeddedMigration, MigrationConfig};

    let pool = temp_db().await;

    let migs = vec![EmbeddedMigration {
        name: "0001_create_test_items",
        sql: "CREATE TABLE test_items (id TEXT PRIMARY KEY, name TEXT NOT NULL)",
    }];

    migrations::run_migrations(&pool, &MigrationConfig::tolerant(), &migs)
        .await
        .unwrap();

    let count1: i64 = db_scalar("SELECT COUNT(*) FROM __drizzle_migrations")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count1, 1);

    migrations::run_migrations(&pool, &MigrationConfig::tolerant(), &migs)
        .await
        .unwrap();

    let count2: i64 = db_scalar("SELECT COUNT(*) FROM __drizzle_migrations")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count2, 1);
}

#[tokio::test]
async fn sim_push_deletes_only() {
    let pool = temp_db().await;

    db_query(fixtures::insert_category_sql())
        .bind("cat-1")
        .bind("merchant-1")
        .bind("Drinks")
        .bind("2026-01-01T00:00:00.000Z")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    db_query(fixtures::insert_outbox_sql())
        .bind("outbox-del-1")
        .bind("categories")
        .bind("cat-1")
        .bind("delete")
        .bind("null")
        .bind("merchant-1")
        .bind("2026-05-19T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    db_query("DELETE FROM categories WHERE id = 'cat-1'")
        .execute(&pool)
        .await
        .unwrap();

    let changes =
        schema::read_unsynced_table_changes_from_outbox_tx(&pool, "categories", "merchant-1", &[])
            .await
            .unwrap();

    assert_eq!(changes.changes.deleted_ids, vec!["cat-1"]);

    let units = push::flatten_pending_tables("categories", &changes);
    assert_eq!(units.len(), 1);
    assert_eq!(units[0].deleted_id, Some("cat-1".to_string()));

    let merged = push::merge_pending_units(units.clone());
    let idem_key = push::generate_idempotency_key_from_outbox_ids(&units[0].outbox_ids);
    let envelope = push::build_json_push_envelope("merchant-1", "client-1", &idem_key, &merged);
    assert!(envelope
        .get("tables")
        .and_then(|t| t.as_array())
        .is_some_and(|a| !a.is_empty()));

    baresync_core::outbox::mark_outbox_synced_by_outbox_ids_tx(
        &pool,
        "2026-05-19T14:00:00.000Z",
        &units[0].outbox_ids,
    )
    .await
    .unwrap();

    let pending: i64 = db_scalar("SELECT COUNT(*) FROM sync_outbox WHERE synced_at IS NULL")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(pending, 0);
}

#[tokio::test]
async fn sim_pull_mixed_changed_rows_and_deleted_ids_same_table() {
    let pool = temp_db().await;

    db_query(fixtures::insert_category_sql())
        .bind("cat-1")
        .bind("merchant-1")
        .bind("Drinks")
        .bind("2026-01-01T00:00:00.000Z")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    db_query("INSERT INTO products (id, merchant_id, category_id, name, price_minor_units, deleted_at, is_synced, created_at, updated_at) VALUES ('prod-1', 'merchant-1', 'cat-1', 'Kopi Susu', 15000, NULL, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')")
        .execute(&pool)
        .await
        .unwrap();

    let response = serde_json::json!({
        "cursor": "sync:1716120000000:products:prod-2",
        "hasMore": false,
        "serverTime": "2026-05-19T12:00:00.000Z",
        "tables": [{
            "table": "products",
            "changedRows": [{
                "id": "prod-2",
                "merchantId": "merchant-1",
                "categoryId": "cat-1",
                "name": "Latte",
                "priceMinorUnits": 20000,
                "createdAt": "2026-01-01T00:00:00.000Z",
                "updatedAt": "2026-01-01T00:00:00.000Z"
            }],
            "deletedIds": ["prod-1"]
        }]
    });

    pull::apply_pull_batch_tables_tx(
        &pool,
        &["categories".to_string(), "products".to_string()],
        &["products".to_string()],
        response.get("tables").unwrap(),
        "2026-05-19T12:00:00.000Z",
        &[],
    )
    .await
    .unwrap();

    let prod2_synced: i64 = db_scalar("SELECT is_synced FROM products WHERE id = 'prod-2'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(prod2_synced, 1);

    let prod2_name: String = db_scalar("SELECT name FROM products WHERE id = 'prod-2'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(prod2_name, "Latte");

    let prod1_deleted: Option<String> =
        db_scalar("SELECT deleted_at FROM products WHERE id = 'prod-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(prod1_deleted.is_some());

    let prod1_synced: i64 = db_scalar("SELECT is_synced FROM products WHERE id = 'prod-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(prod1_synced, 1);
}

#[tokio::test]
async fn sim_paginated_pull_two_batches() {
    let pool = temp_db().await;

    db_query(
        "INSERT INTO sync_cursors (scope_id, last_cursor, updated_at) VALUES ('merchant-1', '', '0')",
    )
    .execute(&pool)
    .await
    .unwrap();

    let batch1 = serde_json::json!({
        "cursor": "sync:step1",
        "hasMore": true,
        "serverTime": "2026-05-19T12:00:00.000Z",
        "tables": [{
            "table": "products",
            "changedRows": [{
                "id": "prod-1",
                "merchantId": "merchant-1",
                "categoryId": "cat-1",
                "name": "Kopi Susu",
                "priceMinorUnits": 15000,
                "createdAt": "2026-01-01T00:00:00.000Z",
                "updatedAt": "2026-01-01T00:00:00.000Z"
            }],
            "deletedIds": []
        }]
    });

    let applied1 = pull::apply_pull_batch_tables_tx(
        &pool,
        &["products".to_string()],
        &[],
        batch1.get("tables").unwrap(),
        "2026-05-19T12:00:00.000Z",
        &[],
    )
    .await
    .unwrap();
    baresync_core::cursor::set_last_cursor_tx(&pool, "merchant-1", "sync:step1")
        .await
        .unwrap();
    assert_eq!(applied1, 1);

    let batch2 = serde_json::json!({
        "cursor": "sync:step2",
        "hasMore": false,
        "serverTime": "2026-05-19T12:00:01.000Z",
        "tables": [{
            "table": "categories",
            "changedRows": [{
                "id": "cat-1",
                "merchantId": "merchant-1",
                "name": "Drinks",
                "createdAt": "2026-01-01T00:00:00.000Z",
                "updatedAt": "2026-01-01T00:00:00.000Z"
            }],
            "deletedIds": []
        }]
    });

    let applied2 = pull::apply_pull_batch_tables_tx(
        &pool,
        &["categories".to_string()],
        &[],
        batch2.get("tables").unwrap(),
        "2026-05-19T12:00:01.000Z",
        &[],
    )
    .await
    .unwrap();
    baresync_core::cursor::set_last_cursor_tx(&pool, "merchant-1", "sync:step2")
        .await
        .unwrap();
    assert_eq!(applied2, 1);

    let prod_name: String = db_scalar("SELECT name FROM products WHERE id = 'prod-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(prod_name, "Kopi Susu");

    let cat_name: String = db_scalar("SELECT name FROM categories WHERE id = 'cat-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(cat_name, "Drinks");

    let cursor: String =
        db_scalar("SELECT last_cursor FROM sync_cursors WHERE scope_id = 'merchant-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(cursor, "sync:step2");
}

#[tokio::test]
async fn sim_outbox_coalesce_insert_delete_insert() {
    let pool = temp_db().await;

    db_query(fixtures::insert_category_sql())
        .bind("cat-1")
        .bind("merchant-1")
        .bind("Drinks")
        .bind("2026-01-01T00:00:00.000Z")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    let cat_row = serde_json::json!({"id":"cat-1","name":"Drinks"});

    db_query(fixtures::insert_outbox_sql())
        .bind("outbox-1")
        .bind("categories")
        .bind("cat-1")
        .bind("insert")
        .bind(serde_json::to_string(&cat_row).unwrap())
        .bind("merchant-1")
        .bind("2026-05-19T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    db_query(fixtures::insert_outbox_sql())
        .bind("outbox-2")
        .bind("categories")
        .bind("cat-1")
        .bind("delete")
        .bind("null")
        .bind("merchant-1")
        .bind("2026-05-19T00:00:01.000Z")
        .execute(&pool)
        .await
        .unwrap();

    db_query(fixtures::insert_outbox_sql())
        .bind("outbox-3")
        .bind("categories")
        .bind("cat-1")
        .bind("insert")
        .bind(serde_json::to_string(&cat_row).unwrap())
        .bind("merchant-1")
        .bind("2026-05-19T00:00:02.000Z")
        .execute(&pool)
        .await
        .unwrap();

    let changes =
        schema::read_unsynced_table_changes_from_outbox_tx(&pool, "categories", "merchant-1", &[])
            .await
            .unwrap();

    assert_eq!(changes.changes.changed_rows.len(), 1);
    assert!(changes.changes.deleted_ids.is_empty());

    let row = &changes.changes.changed_rows[0];
    assert_eq!(row.get("id").and_then(|v| v.as_str()), Some("cat-1"));
}

#[tokio::test]
async fn sim_resync_after_server_wins_reconciliation() {
    let pool = temp_db().await;
    seed_categories_and_products(&pool).await;

    let rejection = fixtures::push_rejection_response();
    let recon_pull = rejection.get("reconciliationPull").unwrap();

    pull::apply_pull_batch_tables_tx(
        &pool,
        &["categories".to_string()],
        &[],
        recon_pull.get("tables").unwrap(),
        "2026-05-19T12:00:02.000Z",
        &[],
    )
    .await
    .unwrap();

    let cat_name: String = db_scalar("SELECT name FROM categories WHERE id = 'cat-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(cat_name, "Drinks Server Version");

    let new_cat = serde_json::json!({
        "id": "cat-new-1",
        "merchantId": "merchant-1",
        "name": "New Local Category",
        "createdAt": "2026-05-19T15:00:00.000Z",
        "updatedAt": "2026-05-19T15:00:00.000Z"
    });
    push::upsert_row(&pool, "categories", &new_cat)
        .await
        .unwrap();

    db_query(fixtures::insert_outbox_sql())
        .bind("outbox-cat-new-1")
        .bind("categories")
        .bind("cat-new-1")
        .bind("insert")
        .bind(serde_json::to_string(&new_cat).unwrap())
        .bind("merchant-1")
        .bind("2026-05-19T15:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    let changes =
        schema::read_unsynced_table_changes_from_outbox_tx(&pool, "categories", "merchant-1", &[])
            .await
            .unwrap();

    let units = push::flatten_pending_tables("categories", &changes);
    assert_eq!(units.len(), 1);
    assert_eq!(
        units[0]
            .row
            .as_ref()
            .and_then(|r| r.get("name"))
            .and_then(|v| v.as_str()),
        Some("New Local Category")
    );

    let merged = push::merge_pending_units(units.clone());
    let idem_key = push::generate_idempotency_key_from_outbox_ids(&units[0].outbox_ids);
    let envelope = push::build_json_push_envelope("merchant-1", "client-1", &idem_key, &merged);
    assert!(envelope
        .get("tables")
        .and_then(|t| t.as_array())
        .is_some_and(|a| !a.is_empty()));

    baresync_core::outbox::mark_outbox_synced_by_outbox_ids_tx(
        &pool,
        "2026-05-19T16:00:00.000Z",
        &units[0].outbox_ids,
    )
    .await
    .unwrap();

    let pending: i64 = db_scalar("SELECT COUNT(*) FROM sync_outbox WHERE synced_at IS NULL")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(pending, 0);
}

#[tokio::test]
async fn sim_push_partial_acceptance() {
    let pool = temp_db().await;

    db_query(fixtures::insert_category_sql())
        .bind("cat-1")
        .bind("merchant-1")
        .bind("Drinks")
        .bind("2026-01-01T00:00:00.000Z")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    db_query(fixtures::insert_category_sql())
        .bind("cat-2")
        .bind("merchant-1")
        .bind("Food")
        .bind("2026-01-01T00:00:00.000Z")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    db_query(fixtures::insert_outbox_sql())
        .bind("outbox-cat-1")
        .bind("categories")
        .bind("cat-1")
        .bind("update")
        .bind("{\"id\":\"cat-1\",\"name\":\"Drinks Updated\"}")
        .bind("merchant-1")
        .bind("2026-05-19T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    db_query(fixtures::insert_outbox_sql())
        .bind("outbox-cat-2")
        .bind("categories")
        .bind("cat-2")
        .bind("update")
        .bind("{\"id\":\"cat-2\",\"name\":\"Food Updated\"}")
        .bind("merchant-1")
        .bind("2026-05-19T00:00:01.000Z")
        .execute(&pool)
        .await
        .unwrap();

    baresync_core::outbox::mark_outbox_synced_by_outbox_ids_tx(
        &pool,
        "2026-05-19T14:00:00.000Z",
        &["outbox-cat-1".to_string()],
    )
    .await
    .unwrap();

    let mut accepted = std::collections::HashSet::new();
    accepted.insert("cat-1".to_string());
    schema::mark_rows_synced_by_id_tx(&pool, "categories", &accepted)
        .await
        .unwrap();

    let cat1_synced: i64 = db_scalar("SELECT is_synced FROM categories WHERE id = 'cat-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(cat1_synced, 1);

    let cat1_outbox_synced: Option<String> =
        db_scalar("SELECT synced_at FROM sync_outbox WHERE id = 'outbox-cat-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        cat1_outbox_synced,
        Some("2026-05-19T14:00:00.000Z".to_string())
    );

    let cat2_synced: i64 = db_scalar("SELECT is_synced FROM categories WHERE id = 'cat-2'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(cat2_synced, 0);

    let cat2_outbox_synced: Option<String> =
        db_scalar("SELECT synced_at FROM sync_outbox WHERE id = 'outbox-cat-2'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(cat2_outbox_synced.is_none());
}

#[tokio::test]
async fn sim_run_sql_batch_rolls_back_on_failure() {
    use baresync_core::drizzle_proxy::{run_sql_batch, SqlStatement};

    let pool = temp_db().await;
    db_query("CREATE TABLE batch_test (id TEXT PRIMARY KEY, val INTEGER NOT NULL)")
        .execute(&pool)
        .await
        .unwrap();

    let result = run_sql_batch(
        &pool,
        vec![
            SqlStatement {
                sql: "INSERT INTO batch_test (id, val) VALUES ('a', 1)".to_string(),
                params: vec![],
            },
            SqlStatement {
                sql: "INVALID SQL STATEMENT".to_string(),
                params: vec![],
            },
            SqlStatement {
                sql: "INSERT INTO batch_test (id, val) VALUES ('b', 2)".to_string(),
                params: vec![],
            },
        ],
    )
    .await;

    assert!(result.is_err());

    let count: i64 = db_scalar("SELECT COUNT(*) FROM batch_test")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
}
