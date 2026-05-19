use baresync_core::drizzle_proxy::{self, BatchResult, SqlQuery, SqlStatement};

use sqlx::SqlitePool;
use std::sync::Arc;
use tauri::{command, AppHandle, State};

use crate::db::get_db_path;

pub struct PluginState {
    pub pool: Arc<SqlitePool>,
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
pub async fn get_db_info(app: AppHandle) -> Result<drizzle_proxy::DbInfo, String> {
    let db_path = get_db_path(&app)?;
    drizzle_proxy::get_db_info(&db_path).await.map_err(|e| e.to_string())
}
