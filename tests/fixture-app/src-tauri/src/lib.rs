use std::env;
use std::future::Future;
#[cfg(target_os = "android")]
use std::fs;
use std::pin::Pin;
use std::sync::Arc;

use baresync_core::error::{classify_http_error, SyncError};
use baresync_core::http::{SyncHttpTransport, SyncTransportFuture};
use prost::Message;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{command, generate_context, generate_handler, State};

pub mod protobuf_generated;

use protobuf_generated::{
    CategoriesChanges, CategoriesRow, ProductsChanges, ProductsRow, SyncPullBatchResponse,
    SyncPushBatchRequest, SyncPushBatchResponse, SyncTableAck,
};
use tauri_plugin_baresync::builder::Builder as BaresyncBuilder;
use tauri_plugin_baresync::commands::{self, run_sql_batch_with_state, PluginState};

#[derive(Serialize)]
struct FixtureRuntimeConfig {
    api_url: String,
    encoding: String,
}

fn fixture_db_path() -> String {
    let run_id = env::var("BARESYNC_FIXTURE_RUN_ID").unwrap_or_else(|_| "local".to_string());

    #[cfg(target_os = "android")]
    {
        let db_dir = "/data/user/0/com.baresync.fixture/files";
        if let Err(error) = fs::create_dir_all(db_dir) {
            eprintln!("failed to create Android fixture DB directory {db_dir}: {error}");
        }

        format!("{db_dir}/baresync-fixture-{run_id}.db")
    }

    #[cfg(not(target_os = "android"))]
    {
        format!("/tmp/baresync-fixture-{run_id}.db")
    }
}

fn fixture_api_url() -> String {
    if let Ok(url) = env::var("BARESYNC_FIXTURE_API_URL") {
        return url;
    }

    option_env!("BARESYNC_FIXTURE_API_URL")
        .map(std::string::ToString::to_string)
        .unwrap_or_else(|| {
            #[cfg(target_os = "android")]
            {
                "http://10.0.2.2:18080".to_string()
            }

            #[cfg(not(target_os = "android"))]
            {
                "http://127.0.0.1:18080".to_string()
            }
        })
}

fn fixture_encoding() -> String {
    if let Ok(value) = env::var("BARESYNC_FIXTURE_ENCODING") {
        return match value.as_str() {
            "protobuf" => "protobuf".to_string(),
            _ => "json".to_string(),
        };
    }

    option_env!("BARESYNC_FIXTURE_ENCODING")
        .map(|value| match value {
            "protobuf" => "protobuf".to_string(),
            _ => "json".to_string(),
        })
        .unwrap_or_else(|| "json".to_string())
}

fn fixture_contract_tables() -> baresync_core::engine::SyncContractTables {
    baresync_core::engine::SyncContractTables {
        upsert_order: vec!["categories".to_string(), "products".to_string()],
        delete_order: vec!["products".to_string(), "categories".to_string()],
        local_only_columns: vec!["is_synced".to_string()],
    }
}

fn fixture_migrations() -> Vec<baresync_core::migrations::EmbeddedMigration> {
    vec![baresync_core::migrations::EmbeddedMigration {
        name: "0001_init_fixture_schema",
        sql: include_str!("../migrations/0001_init_fixture_schema.sql"),
    }]
}

#[derive(Debug)]
struct FixtureProtobufTransport;

fn box_transport<T>(future: T) -> SyncTransportFuture
where
    T: Future<Output = Result<Value, SyncError>> + Send + 'static,
{
    Box::pin(future) as Pin<Box<dyn Future<Output = Result<Value, SyncError>> + Send>>
}

fn value_string(row: &Value, key: &str) -> String {
    row.get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn value_i64(row: &Value, key: &str) -> i64 {
    row.get(key).and_then(Value::as_i64).unwrap_or_default()
}

fn value_bool(row: &Value, key: &str) -> bool {
    row.get(key).and_then(Value::as_bool).unwrap_or_default()
}

fn categories_row_from_value(row: &Value) -> CategoriesRow {
    CategoriesRow {
        id: value_string(row, "id"),
        merchant_id: value_string(row, "merchantId"),
        name: value_string(row, "name"),
        sort_order: value_i64(row, "sortOrder"),
        deleted_at: value_string(row, "deletedAt"),
        is_synced: value_bool(row, "isSynced"),
        created_at: value_string(row, "createdAt"),
        updated_at: value_string(row, "updatedAt"),
    }
}

fn products_row_from_value(row: &Value) -> ProductsRow {
    ProductsRow {
        id: value_string(row, "id"),
        merchant_id: value_string(row, "merchantId"),
        category_id: value_string(row, "categoryId"),
        name: value_string(row, "name"),
        price_minor_units: value_i64(row, "priceMinorUnits"),
        deleted_at: value_string(row, "deletedAt"),
        is_synced: value_bool(row, "isSynced"),
        created_at: value_string(row, "createdAt"),
        updated_at: value_string(row, "updatedAt"),
    }
}

fn categories_row_to_value(row: &CategoriesRow) -> Value {
    json!({
        "id": row.id,
        "merchantId": row.merchant_id,
        "name": row.name,
        "sortOrder": row.sort_order,
        "deletedAt": if row.deleted_at.is_empty() { Value::Null } else { Value::String(row.deleted_at.clone()) },
        "isSynced": row.is_synced,
        "createdAt": row.created_at,
        "updatedAt": row.updated_at,
    })
}

fn products_row_to_value(row: &ProductsRow) -> Value {
    json!({
        "id": row.id,
        "merchantId": row.merchant_id,
        "categoryId": row.category_id,
        "name": row.name,
        "priceMinorUnits": row.price_minor_units,
        "deletedAt": if row.deleted_at.is_empty() { Value::Null } else { Value::String(row.deleted_at.clone()) },
        "isSynced": row.is_synced,
        "createdAt": row.created_at,
        "updatedAt": row.updated_at,
    })
}

fn changes_from_table(table: &Value) -> (String, Vec<Value>, Vec<String>) {
    let table_name = table
        .get("table")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let changed_rows = table
        .get("changedRows")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let deleted_ids = table
        .get("deletedIds")
        .and_then(Value::as_array)
        .map(|ids| {
            ids.iter()
                .filter_map(Value::as_str)
                .map(std::string::ToString::to_string)
                .collect()
        })
        .unwrap_or_default();
    (table_name, changed_rows, deleted_ids)
}

fn push_request_from_value(envelope: &Value) -> SyncPushBatchRequest {
    let mut request = SyncPushBatchRequest {
        scope_id: value_string(envelope, "scopeId"),
        client_id: value_string(envelope, "clientId"),
        idempotency_key: value_string(envelope, "idempotencyKey"),
        categories: None,
        products: None,
    };

    if let Some(tables) = envelope.get("tables").and_then(Value::as_array) {
        for table in tables {
            let (table_name, changed_rows, deleted_ids) = changes_from_table(table);
            if table_name == "categories" {
                request.categories = Some(CategoriesChanges {
                    changed_rows: changed_rows.iter().map(categories_row_from_value).collect(),
                    deleted_ids,
                });
            } else if table_name == "products" {
                request.products = Some(ProductsChanges {
                    changed_rows: changed_rows.iter().map(products_row_from_value).collect(),
                    deleted_ids,
                });
            }
        }
    }

    request
}

fn pull_response_to_value(response: SyncPullBatchResponse) -> Value {
    let mut tables = Vec::new();
    if let Some(categories) = response.categories {
        tables.push(json!({
            "table": "categories",
            "changedRows": categories.changed_rows.iter().map(categories_row_to_value).collect::<Vec<_>>(),
            "deletedIds": categories.deleted_ids,
        }));
    }
    if let Some(products) = response.products {
        tables.push(json!({
            "table": "products",
            "changedRows": products.changed_rows.iter().map(products_row_to_value).collect::<Vec<_>>(),
            "deletedIds": products.deleted_ids,
        }));
    }

    json!({
        "hasMore": response.has_more,
        "cursor": response.cursor,
        "serverTime": response.server_time,
        "tables": tables,
    })
}

fn table_ack_to_value(ack: &SyncTableAck) -> Value {
    json!({
        "table": ack.table,
        "acceptedCreatedIds": ack.accepted_created_ids,
        "acceptedUpdatedIds": ack.accepted_updated_ids,
        "acceptedDeletedIds": ack.accepted_deleted_ids,
        "rejected": ack.rejected.iter().map(|row| json!({
            "id": row.id,
            "reason": row.reason,
        })).collect::<Vec<_>>(),
    })
}

fn push_response_to_value(response: SyncPushBatchResponse) -> Value {
    json!({
        "tables": response.tables.iter().map(table_ack_to_value).collect::<Vec<_>>(),
        "serverTime": response.server_time,
    })
}

impl SyncHttpTransport for FixtureProtobufTransport {
    fn send_push_request(&self, api_url: String, envelope: Value) -> SyncTransportFuture {
        box_transport(async move {
            let url = format!("{}/sync/push", api_url.trim_end_matches('/'));
            let request = push_request_from_value(&envelope);
            let body = request.encode_to_vec();
            let response = reqwest::Client::new()
                .post(url)
                .header("Content-Type", "application/x-protobuf")
                .body(body)
                .send()
                .await
                .map_err(|e| SyncError::Network(format!("Push request failed: {e}")))?;
            let status = response.status();
            let bytes = response
                .bytes()
                .await
                .map_err(|e| SyncError::Network(format!("Failed to read response body: {e}")))?;
            if !status.is_success() {
                let body = String::from_utf8_lossy(&bytes);
                return Err(classify_http_error(status.as_u16(), &body));
            }
            let decoded = SyncPushBatchResponse::decode(bytes.as_ref()).map_err(|e| {
                SyncError::Encoding(format!("Failed to decode protobuf push response: {e}"))
            })?;
            Ok(push_response_to_value(decoded))
        })
    }

    fn send_pull_request(
        &self,
        api_url: String,
        scope_id: String,
        tables: Vec<String>,
        limit: i32,
        cursor: String,
    ) -> SyncTransportFuture {
        box_transport(async move {
            let url = format!("{}/sync/pull", api_url.trim_end_matches('/'));
            let response = reqwest::Client::new()
                .get(url)
                .header("Accept", "application/x-protobuf")
                .query(&[
                    ("scopeId", scope_id.as_str()),
                    ("tables", tables.join(",").as_str()),
                    ("limit", limit.to_string().as_str()),
                    ("cursor", cursor.as_str()),
                ])
                .send()
                .await
                .map_err(|e| SyncError::Network(format!("Pull request failed: {e}")))?;
            let status = response.status();
            let bytes = response
                .bytes()
                .await
                .map_err(|e| SyncError::Network(format!("Failed to read response body: {e}")))?;
            if !status.is_success() {
                let body = String::from_utf8_lossy(&bytes);
                return Err(classify_http_error(status.as_u16(), &body));
            }
            let decoded = SyncPullBatchResponse::decode(bytes.as_ref()).map_err(|e| {
                SyncError::Encoding(format!("Failed to decode protobuf pull response: {e}"))
            })?;
            Ok(pull_response_to_value(decoded))
        })
    }
}

fn fixture_transport() -> Option<Arc<dyn SyncHttpTransport>> {
    if fixture_encoding() == "protobuf" {
        Some(Arc::new(FixtureProtobufTransport))
    } else {
        None
    }
}

#[command]
async fn reset_fixture_state(state: State<'_, PluginState>) -> Result<(), String> {
    run_sql_batch_with_state(
        &state,
        vec![
            baresync_core::drizzle_proxy::SqlStatement {
                sql: "DELETE FROM products".to_string(),
                params: vec![],
            },
            baresync_core::drizzle_proxy::SqlStatement {
                sql: "DELETE FROM categories".to_string(),
                params: vec![],
            },
            baresync_core::drizzle_proxy::SqlStatement {
                sql: "DELETE FROM sync_outbox".to_string(),
                params: vec![],
            },
            baresync_core::drizzle_proxy::SqlStatement {
                sql: "DELETE FROM sync_cursors".to_string(),
                params: vec![],
            },
        ],
    )
    .await
    .map(|_| ())
}

#[command]
async fn run_sql(
    query: baresync_core::drizzle_proxy::SqlQuery,
    state: State<'_, PluginState>,
) -> Result<Vec<baresync_core::drizzle_proxy::SqlRow>, String> {
    commands::run_sql(query, state).await
}

#[command]
async fn run_sql_batch(
    statements: Vec<baresync_core::drizzle_proxy::SqlStatement>,
    state: State<'_, PluginState>,
) -> Result<baresync_core::drizzle_proxy::BatchResult, String> {
    commands::run_sql_batch(statements, state).await
}

#[command]
async fn get_db_info(state: State<'_, PluginState>) -> Result<baresync_core::db::DbInfo, String> {
    commands::get_db_info(state).await
}

#[command]
async fn run_migrations(state: State<'_, PluginState>) -> Result<(), String> {
    commands::run_migrations(state).await
}

#[command]
async fn get_migration_status(
    state: State<'_, PluginState>,
) -> Result<Vec<baresync_core::migrations::MigrationRecord>, String> {
    commands::get_migration_status(state).await
}

#[command]
async fn get_fixture_runtime_config() -> Result<FixtureRuntimeConfig, String> {
    let config = FixtureRuntimeConfig {
        api_url: fixture_api_url(),
        encoding: fixture_encoding(),
    };
    eprintln!(
        "[fixture-app] get_fixture_runtime_config api_url={} encoding={}",
        config.api_url, config.encoding
    );
    Ok(config)
}

#[command]
async fn sync_now(
    state: State<'_, PluginState>,
    scope_id: String,
) -> Result<baresync_core::engine::SyncNowResult, String> {
    commands::sync_now(state, scope_id).await
}

#[command]
async fn sync_push(
    state: State<'_, PluginState>,
    scope_id: String,
) -> Result<baresync_core::push::PushResult, String> {
    commands::sync_push(state, scope_id).await
}

#[command]
async fn sync_pull(
    state: State<'_, PluginState>,
    scope_id: String,
) -> Result<baresync_core::pull::PullResult, String> {
    commands::sync_pull(state, scope_id).await
}

#[command]
async fn sync_full_resync(
    state: State<'_, PluginState>,
    scope_id: String,
) -> Result<baresync_core::engine::SyncNowResult, String> {
    commands::sync_full_resync(state, scope_id).await
}

#[command]
async fn get_sync_local_state(
    state: State<'_, PluginState>,
    scope_id: String,
) -> Result<baresync_core::state::LocalSyncState, String> {
    commands::get_sync_local_state(state, scope_id).await
}

#[command]
async fn purge_synced_outbox(
    state: State<'_, PluginState>,
    older_than: String,
) -> Result<u64, String> {
    commands::purge_synced_outbox(state, older_than).await
}

#[command]
async fn run_garbage_collection(
    state: State<'_, PluginState>,
    scope_id: String,
) -> Result<usize, String> {
    commands::run_garbage_collection(state, scope_id).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            BaresyncBuilder::new()
                .api_base_url(fixture_api_url())
                .encoding(fixture_encoding())
                .db_path(fixture_db_path())
                .contract_tables(fixture_contract_tables())
                .migrations(fixture_migrations())
                .transport(fixture_transport().unwrap_or_else(baresync_core::http::default_transport))
                .build(),
        )
        .invoke_handler(generate_handler![
            reset_fixture_state,
            run_sql,
            run_sql_batch,
            get_db_info,
            run_migrations,
            get_migration_status,
            get_fixture_runtime_config,
            sync_now,
            sync_push,
            sync_pull,
            sync_full_resync,
            get_sync_local_state,
            purge_synced_outbox,
            run_garbage_collection,
        ])
        .run(generate_context!())
        .expect("failed to run fixture app");
}
