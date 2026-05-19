use std::env;

use tauri::{command, generate_context, generate_handler, State};

use tauri_plugin_baresync::builder::Builder as BaresyncBuilder;
use tauri_plugin_baresync::commands::{self, run_sql_batch_with_state, PluginState};

fn fixture_db_path() -> String {
    let run_id = env::var("BARESYNC_FIXTURE_RUN_ID").unwrap_or_else(|_| "local".to_string());
    format!("/tmp/baresync-fixture-{run_id}.db")
}

fn fixture_api_url() -> String {
    env::var("BARESYNC_FIXTURE_API_URL").unwrap_or_else(|_| "http://127.0.0.1:18080".to_string())
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

fn main() {
    tauri::Builder::default()
        .plugin(
            BaresyncBuilder::new()
                .api_base_url(fixture_api_url())
                .encoding("json")
                .db_path(fixture_db_path())
                .contract_tables(fixture_contract_tables())
                .migrations(fixture_migrations())
                .build(),
        )
        .invoke_handler(generate_handler![
            reset_fixture_state,
            run_sql,
            run_sql_batch,
            get_db_info,
            run_migrations,
            get_migration_status,
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
