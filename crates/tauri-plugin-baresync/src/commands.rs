use baresync_core::config::SyncEngineConfig;
use baresync_core::engine::{SyncContractTables, SyncEngine, SyncNowResult};
use baresync_core::migrations::{self, EmbeddedMigration, MigrationConfig, MigrationRecord};
use baresync_core::state::LocalSyncState;

use baresync_core::drizzle_proxy::{self, BatchResult, SqlQuery, SqlStatement};
use baresync_core::pull::PullResult;
use baresync_core::push::PushResult;

use sqlx::SqlitePool;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{command, State};

pub struct PluginState {
    pub pool: Arc<SqlitePool>,
    pub sync_config: SyncEngineConfig,
    pub contract_tables: SyncContractTables,
    pub db_path: PathBuf,
    pub embedded_migrations: Arc<Vec<EmbeddedMigration>>,
}

fn make_engine(
    state: &PluginState,
    scope_id: String,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = SyncEngine> + Send + '_>> {
    Box::pin(async move {
        let mut config = state.sync_config.clone();
        config.scope_id = scope_id;
        SyncEngine::new((*state.pool).clone(), config, state.contract_tables.clone()).await
    })
}

#[command]
pub async fn run_sql(query: SqlQuery, state: State<'_, PluginState>) -> Result<Vec<drizzle_proxy::SqlRow>, String> {
    drizzle_proxy::run_sql(&state.pool, query)
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn run_sql_batch(
    statements: Vec<SqlStatement>,
    state: State<'_, PluginState>,
) -> Result<BatchResult, String> {
    drizzle_proxy::run_sql_batch(&state.pool, statements)
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn get_db_info(state: State<'_, PluginState>) -> Result<baresync_core::db::DbInfo, String> {
    baresync_core::db::get_db_info(&state.db_path).await.map_err(|e| e.to_string())
}

#[command]
pub async fn run_migrations(state: State<'_, PluginState>) -> Result<(), String> {
    let config = MigrationConfig::strict();
    migrations::run_migrations(&state.pool, &config, &state.embedded_migrations)
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn get_migration_status(state: State<'_, PluginState>) -> Result<Vec<MigrationRecord>, String> {
    migrations::get_migration_status(&state.pool)
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn sync_now(
    state: State<'_, PluginState>,
    scope_id: String,
) -> Result<SyncNowResult, String> {
    let engine = make_engine(&state, scope_id).await;
    engine.sync_now(1000).await.map_err(|e| e.to_string())
}

#[command]
pub async fn sync_push(
    state: State<'_, PluginState>,
    scope_id: String,
) -> Result<PushResult, String> {
    let engine = make_engine(&state, scope_id).await;
    engine.push().await.map_err(|e| e.to_string())
}

#[command]
pub async fn sync_pull(
    state: State<'_, PluginState>,
    scope_id: String,
) -> Result<PullResult, String> {
    let engine = make_engine(&state, scope_id).await;
    engine.pull(1000).await.map_err(|e| e.to_string())
}

#[command]
pub async fn sync_full_resync(
    state: State<'_, PluginState>,
    scope_id: String,
) -> Result<SyncNowResult, String> {
    let engine = make_engine(&state, scope_id).await;
    engine.sync_full_resync(1000).await.map_err(|e| e.to_string())
}

#[command]
pub async fn get_sync_local_state(
    state: State<'_, PluginState>,
    scope_id: String,
) -> Result<LocalSyncState, String> {
    let engine = make_engine(&state, scope_id).await;
    engine.get_sync_local_state().await.map_err(|e| e.to_string())
}

#[command]
pub async fn purge_synced_outbox(
    state: State<'_, PluginState>,
    older_than: String,
) -> Result<u64, String> {
    let engine = make_engine(&state, String::new()).await;
    engine.purge_synced_outbox(&older_than).await.map_err(|e| e.to_string())
}

#[command]
pub async fn run_garbage_collection(
    state: State<'_, PluginState>,
    scope_id: String,
) -> Result<usize, String> {
    let engine = make_engine(&state, scope_id).await;
    engine.run_garbage_collection().await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    #[test]
    fn command_signatures_exist() {
        let _ = super::sync_now;
        let _ = super::sync_push;
        let _ = super::sync_pull;
        let _ = super::sync_full_resync;
        let _ = super::get_sync_local_state;
        let _ = super::purge_synced_outbox;
        let _ = super::run_garbage_collection;
        let _ = super::run_sql;
        let _ = super::run_sql_batch;
        let _ = super::get_db_info;
        let _ = super::run_migrations;
        let _ = super::get_migration_status;
    }
}
