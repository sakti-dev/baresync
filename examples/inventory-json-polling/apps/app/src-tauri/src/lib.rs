use std::env;
use std::path::PathBuf;

use tauri::{command, generate_context, generate_handler, State};
use tauri_plugin_baresync::builder::Builder as BaresyncBuilder;
use tauri_plugin_baresync::commands::{self, PluginState};

fn inventory_db_path() -> String {
    let base = env::var("INVENTORY_DB_PATH").unwrap_or_else(|_| {
        let mut path = std::env::temp_dir();
        path.push("baresync-inventory.db");
        path.to_string_lossy().to_string()
    });

    PathBuf::from(base).to_string_lossy().to_string()
}

fn inventory_contract_tables() -> baresync_core::engine::SyncContractTables {
    baresync_core::engine::SyncContractTables {
        upsert_order: vec![
            "locations".to_string(),
            "items".to_string(),
            "stock_counts".to_string(),
        ],
        delete_order: vec![
            "stock_counts".to_string(),
            "items".to_string(),
            "locations".to_string(),
        ],
        local_only_columns: vec!["is_synced".to_string()],
    }
}

fn inventory_migrations() -> Vec<baresync_core::migrations::EmbeddedMigration> {
    vec![baresync_core::migrations::EmbeddedMigration {
        name: "0001_init_inventory_schema",
        sql: include_str!("../migrations/0001_init_inventory_schema.sql"),
    }]
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

#[command]
async fn start_polling(
    state: State<'_, PluginState>,
    scope_id: String,
) -> Result<(), String> {
    commands::start_polling(state, scope_id).await
}

#[command]
async fn stop_polling(state: State<'_, PluginState>) -> Result<(), String> {
    commands::stop_polling(state).await
}

#[command]
async fn pause_polling(state: State<'_, PluginState>) -> Result<(), String> {
    commands::pause_polling(state).await
}

#[command]
async fn resume_polling(state: State<'_, PluginState>) -> Result<(), String> {
    commands::resume_polling(state).await
}

#[command]
async fn get_polling_status(
    state: State<'_, PluginState>,
) -> Result<tauri_plugin_baresync::polling::PollingStatus, String> {
    commands::get_polling_status(state).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            BaresyncBuilder::new()
                .api_base_url("http://127.0.0.1:18181")
                .encoding("json")
                .db_path(inventory_db_path())
                .contract_tables(inventory_contract_tables())
                .migrations(inventory_migrations())
                .poll_interval_secs(30)
                .build(),
        )
        .invoke_handler(generate_handler![
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
            start_polling,
            stop_polling,
            pause_polling,
            resume_polling,
            get_polling_status,
        ])
        .run(generate_context!())
        .expect("failed to run inventory app");
}
