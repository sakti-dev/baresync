use std::env;
#[cfg(target_os = "android")]
use std::fs;
use std::sync::Arc;

use baresync_core::http::SyncHttpTransport;
use serde::Serialize;
use tauri::{command, generate_context, generate_handler, State};

pub mod protobuf_generated;

use protobuf_generated::generated_protobuf_transport;
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

fn fixture_transport() -> Option<Arc<dyn SyncHttpTransport>> {
    if fixture_encoding() == "protobuf" {
        Some(generated_protobuf_transport())
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
                .transport(
                    fixture_transport().unwrap_or_else(baresync_core::http::default_transport),
                )
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

#[cfg(test)]
mod tests {
    use crate::protobuf_generated::{SyncPullBatchRequest, SyncStatusRequest};
    use prost::Message;

    #[test]
    fn protobuf_status_helper_builds_post_request_and_round_trips() {
        let request = SyncStatusRequest {
            scope_id: "merchant-1".to_string(),
            cursor: "sync:123:categories:row-1".to_string(),
        };
        assert_eq!(request.scope_id, "merchant-1");
        assert_eq!(request.cursor, "sync:123:categories:row-1");

        let encoded = request.encode_to_vec();
        let decoded = SyncStatusRequest::decode(encoded.as_ref()).unwrap();
        assert_eq!(decoded.scope_id, "merchant-1");
        assert_eq!(decoded.cursor, "sync:123:categories:row-1");

        let built = reqwest::Client::new()
            .post("http://localhost/sync/status")
            .body(encoded)
            .build()
            .unwrap();

        assert_eq!(built.method(), reqwest::Method::POST);
        assert_eq!(built.url().path(), "/sync/status");
    }

    #[test]
    fn protobuf_pull_helper_builds_post_request_and_round_trips() {
        let request = SyncPullBatchRequest {
            scope_id: "merchant-1".to_string(),
            tables: vec!["categories".to_string(), "products".to_string()],
            cursor: "sync:123:categories:row-1".to_string(),
            limit: 1000,
        };
        assert_eq!(request.scope_id, "merchant-1");
        assert_eq!(request.tables, vec!["categories", "products"]);
        assert_eq!(request.limit, 1000);
        assert_eq!(request.cursor, "sync:123:categories:row-1");

        let encoded = request.encode_to_vec();
        let decoded = SyncPullBatchRequest::decode(encoded.as_ref()).unwrap();
        assert_eq!(decoded.scope_id, "merchant-1");
        assert_eq!(decoded.tables, vec!["categories", "products"]);
        assert_eq!(decoded.limit, 1000);
        assert_eq!(decoded.cursor, "sync:123:categories:row-1");

        let built = reqwest::Client::new()
            .post("http://localhost/sync/pull")
            .body(encoded)
            .build()
            .unwrap();

        assert_eq!(built.method(), reqwest::Method::POST);
        assert_eq!(built.url().path(), "/sync/pull");
    }
}
