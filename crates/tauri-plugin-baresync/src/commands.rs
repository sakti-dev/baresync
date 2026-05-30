use baresync_core::config::SyncEngineConfig;
use baresync_core::engine::{SyncContractTables, SyncEngine, SyncNowResult};
use baresync_core::migrations::{self, EmbeddedMigration, MigrationConfig, MigrationRecord};
use baresync_core::state::LocalSyncState;

use baresync_core::drizzle_proxy::{self, BatchResult, SqlQuery, SqlStatement};
use baresync_core::pull::PullResult;
use baresync_core::push::PushResult;

use baresync_core::db::DbClient;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::{command, AppHandle, Manager, RunEvent, Runtime, State, WindowEvent};
use tokio::sync::{mpsc, Notify};

use crate::polling::{self, ControlMsg, PollingState, PollingStatus};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PluginEvent {
    DataChanged,
    SyncStatusChanged,
}

pub trait PluginEventSink: Send + Sync {
    fn emit(&self, event: PluginEvent);
}

#[derive(Default)]
pub struct NoopPluginEventSink;

impl PluginEventSink for NoopPluginEventSink {
    fn emit(&self, _event: PluginEvent) {}
}

pub struct PluginState {
    pub db: Arc<DbClient>,
    pub sync_config: SyncEngineConfig,
    pub contract_tables: SyncContractTables,
    pub db_path: PathBuf,
    pub embedded_migrations: Arc<Vec<EmbeddedMigration>>,
    pub migrations_path: Option<PathBuf>,
    pub poll_notify: Arc<Notify>,
    pub sync_in_progress: Arc<AtomicBool>,
    pub poll_control_tx: tokio::sync::Mutex<Option<mpsc::Sender<ControlMsg>>>,
    pub poll_task_handle: tokio::sync::Mutex<Option<tokio::task::JoinHandle<()>>>,
    pub poll_state: Arc<tokio::sync::Mutex<PollingState>>,
    pub poll_interval_secs: u64,
    pub poll_on_background: bool,
    pub event_sink: Arc<dyn PluginEventSink>,
}

fn make_engine(
    state: &PluginState,
    scope_id: String,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = SyncEngine> + Send + '_>> {
    Box::pin(async move {
        let mut config = state.sync_config.clone();
        config.scope_id = scope_id;
        SyncEngine::new(
            state.db.as_ref().clone(),
            config,
            state.contract_tables.clone(),
        )
        .await
    })
}

pub async fn run_sql_with_state(
    state: &PluginState,
    query: SqlQuery,
) -> Result<Vec<drizzle_proxy::SqlRow>, String> {
    let result = drizzle_proxy::run_sql_with_metadata(&state.db, query)
        .await
        .map_err(|e| e.to_string())?;
    if result.rows_affected > 0 {
        state.event_sink.emit(PluginEvent::DataChanged);
    }
    Ok(result.rows)
}

#[command]
pub async fn run_sql(
    query: SqlQuery,
    state: State<'_, PluginState>,
) -> Result<Vec<drizzle_proxy::SqlRow>, String> {
    let result = run_sql_with_state(&state, query).await;
    if result.is_ok() {
        state.poll_notify.notify_one();
    }
    result
}

pub async fn run_sql_batch_with_state(
    state: &PluginState,
    statements: Vec<SqlStatement>,
) -> Result<BatchResult, String> {
    let result = drizzle_proxy::run_sql_batch(&state.db, statements)
        .await
        .map_err(|e| e.to_string())?;
    if result.rows_affected > 0 {
        state.event_sink.emit(PluginEvent::DataChanged);
    }
    Ok(result)
}

#[command]
pub async fn run_sql_batch(
    statements: Vec<SqlStatement>,
    state: State<'_, PluginState>,
) -> Result<BatchResult, String> {
    let result = run_sql_batch_with_state(&state, statements).await;
    if result.is_ok() {
        state.poll_notify.notify_one();
    }
    result
}

pub async fn get_db_info_with_state(
    state: &PluginState,
) -> Result<baresync_core::db::DbInfo, String> {
    baresync_core::db::get_db_info(&state.db_path)
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn get_db_info(
    state: State<'_, PluginState>,
) -> Result<baresync_core::db::DbInfo, String> {
    get_db_info_with_state(&state).await
}

pub async fn run_migrations_with_state(state: &PluginState) -> Result<(), String> {
    let config = MigrationConfig::strict();
    if let Some(path) = &state.migrations_path {
        migrations::run_migration_files(&state.db, &config, path)
            .await
            .map_err(|e| e.to_string())
    } else {
        migrations::run_migrations(&state.db, &config, &state.embedded_migrations)
            .await
            .map_err(|e| e.to_string())
    }
}

#[command]
pub async fn run_migrations(state: State<'_, PluginState>) -> Result<(), String> {
    run_migrations_with_state(&state).await
}

pub async fn get_migration_status_with_state(
    state: &PluginState,
) -> Result<Vec<MigrationRecord>, String> {
    migrations::get_migration_status(&state.db)
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn get_migration_status(
    state: State<'_, PluginState>,
) -> Result<Vec<MigrationRecord>, String> {
    get_migration_status_with_state(&state).await
}

#[command]
pub async fn sync_now(
    state: State<'_, PluginState>,
    scope_id: String,
) -> Result<SyncNowResult, String> {
    sync_now_with_state(&state, scope_id).await
}

pub async fn sync_now_with_state(
    state: &PluginState,
    scope_id: String,
) -> Result<SyncNowResult, String> {
    let engine = make_engine(state, scope_id).await;
    let result = engine.sync_now(1000).await.map_err(|e| e.to_string());
    if let Ok(sync_result) = &result {
        if sync_now_result_has_data_changed(sync_result) {
            state.event_sink.emit(PluginEvent::DataChanged);
        }
        state.event_sink.emit(PluginEvent::SyncStatusChanged);
        notify_polling_sync_completed(state).await;
    }
    result
}

#[command]
pub async fn sync_push(
    state: State<'_, PluginState>,
    scope_id: String,
) -> Result<PushResult, String> {
    sync_push_with_state(&state, scope_id).await
}

pub async fn sync_push_with_state(
    state: &PluginState,
    scope_id: String,
) -> Result<PushResult, String> {
    let engine = make_engine(state, scope_id).await;
    let result = engine.push().await.map_err(|e| e.to_string());
    if let Ok(push_result) = &result {
        if !push_result.tables_synced.is_empty() {
            state.event_sink.emit(PluginEvent::DataChanged);
        }
        state.event_sink.emit(PluginEvent::SyncStatusChanged);
        notify_polling_sync_completed(state).await;
    }
    result
}

#[command]
pub async fn sync_pull(
    state: State<'_, PluginState>,
    scope_id: String,
) -> Result<PullResult, String> {
    sync_pull_with_state(&state, scope_id).await
}

pub async fn sync_pull_with_state(
    state: &PluginState,
    scope_id: String,
) -> Result<PullResult, String> {
    let engine = make_engine(state, scope_id).await;
    let result = engine.pull(1000).await.map_err(|e| e.to_string());
    if let Ok(pull_result) = &result {
        if pull_result.rows_received > 0 {
            state.event_sink.emit(PluginEvent::DataChanged);
        }
        state.event_sink.emit(PluginEvent::SyncStatusChanged);
        notify_polling_sync_completed(state).await;
    }
    result
}

#[command]
pub async fn sync_full_resync(
    state: State<'_, PluginState>,
    scope_id: String,
) -> Result<SyncNowResult, String> {
    sync_full_resync_with_state(&state, scope_id).await
}

pub async fn sync_full_resync_with_state(
    state: &PluginState,
    scope_id: String,
) -> Result<SyncNowResult, String> {
    let engine = make_engine(state, scope_id).await;
    let result = engine
        .sync_full_resync(1000)
        .await
        .map_err(|e| e.to_string());
    if let Ok(sync_result) = &result {
        if sync_now_result_has_data_changed(sync_result) {
            state.event_sink.emit(PluginEvent::DataChanged);
        }
        state.event_sink.emit(PluginEvent::SyncStatusChanged);
        notify_polling_sync_completed(state).await;
    }
    result
}

pub async fn get_sync_local_state_with_state(
    state: &PluginState,
    scope_id: String,
) -> Result<LocalSyncState, String> {
    let engine = make_engine(state, scope_id).await;
    engine
        .get_sync_local_state()
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn get_sync_local_state(
    state: State<'_, PluginState>,
    scope_id: String,
) -> Result<LocalSyncState, String> {
    get_sync_local_state_with_state(&state, scope_id).await
}

pub async fn purge_synced_outbox_with_state(
    state: &PluginState,
    older_than: String,
) -> Result<u64, String> {
    let engine = make_engine(state, String::new()).await;
    engine
        .purge_synced_outbox(&older_than)
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn purge_synced_outbox(
    state: State<'_, PluginState>,
    older_than: String,
) -> Result<u64, String> {
    purge_synced_outbox_with_state(&state, older_than).await
}

pub async fn run_garbage_collection_with_state(
    state: &PluginState,
    scope_id: String,
) -> Result<usize, String> {
    let engine = make_engine(state, scope_id).await;
    engine
        .run_garbage_collection()
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn run_garbage_collection(
    state: State<'_, PluginState>,
    scope_id: String,
) -> Result<usize, String> {
    run_garbage_collection_with_state(&state, scope_id).await
}

#[command]
pub async fn start_polling(state: State<'_, PluginState>, scope_id: String) -> Result<(), String> {
    start_polling_with_state(&state, scope_id).await
}

pub async fn start_polling_with_state(state: &PluginState, scope_id: String) -> Result<(), String> {
    {
        let handle_guard = state.poll_task_handle.lock().await;
        if handle_guard.is_some() {
            return Ok(());
        }
    }

    let (tx, rx) = mpsc::channel(10);
    let db = state.db.clone();
    let sync_config = state.sync_config.clone();
    let contract_tables = state.contract_tables.clone();
    let notify = state.poll_notify.clone();
    let sync_in_progress = state.sync_in_progress.clone();
    let interval_secs = state.poll_interval_secs;

    let sync_fn = move |scope: String| {
        let db = db.clone();
        let config = sync_config.clone();
        let tables = contract_tables.clone();
        async move {
            let mut cfg = config.clone();
            cfg.scope_id = scope;
            let engine = SyncEngine::new((*db).clone(), cfg, tables).await;
            engine
                .sync_now(1000)
                .await
                .map(|result| {
                    polling::PollingSyncOutcome::completed(sync_now_result_has_data_changed(
                        &result,
                    ))
                })
                .map_err(|e| e.to_string())
        }
    };

    let handle = tokio::spawn(polling::polling_loop(
        scope_id,
        interval_secs,
        sync_fn,
        state.event_sink.clone(),
        notify,
        rx,
        sync_in_progress,
        state.poll_state.clone(),
    ));

    {
        let mut st = state.poll_state.lock().await;
        st.paused = false;
    }
    *state.poll_control_tx.lock().await = Some(tx);
    *state.poll_task_handle.lock().await = Some(handle);

    Ok(())
}

#[command]
pub async fn stop_polling(state: State<'_, PluginState>) -> Result<(), String> {
    stop_polling_with_state(&state).await
}

pub async fn stop_polling_with_state(state: &PluginState) -> Result<(), String> {
    if let Some(tx) = state.poll_control_tx.lock().await.take() {
        let _ = tx.send(ControlMsg::Stop).await;
    }
    if let Some(handle) = state.poll_task_handle.lock().await.take() {
        let _ = handle.await;
    }
    {
        let mut st = state.poll_state.lock().await;
        st.paused = false;
        st.last_sync_at = None;
    }
    state.event_sink.emit(PluginEvent::SyncStatusChanged);
    Ok(())
}

#[command]
pub async fn pause_polling(state: State<'_, PluginState>) -> Result<(), String> {
    pause_polling_with_state(&state).await
}

pub async fn pause_polling_with_state(state: &PluginState) -> Result<(), String> {
    let guard = state.poll_control_tx.lock().await;
    if let Some(tx) = guard.as_ref() {
        let _ = tx.send(ControlMsg::Pause).await;
    }
    state.event_sink.emit(PluginEvent::SyncStatusChanged);
    Ok(())
}

#[command]
pub async fn resume_polling(state: State<'_, PluginState>) -> Result<(), String> {
    resume_polling_with_state(&state).await
}

pub async fn resume_polling_with_state(state: &PluginState) -> Result<(), String> {
    let guard = state.poll_control_tx.lock().await;
    if let Some(tx) = guard.as_ref() {
        let _ = tx.send(ControlMsg::Resume).await;
    }
    state.event_sink.emit(PluginEvent::SyncStatusChanged);
    Ok(())
}

#[command]
pub async fn get_polling_status(state: State<'_, PluginState>) -> Result<PollingStatus, String> {
    get_polling_status_with_state(&state).await
}

pub async fn get_polling_status_with_state(state: &PluginState) -> Result<PollingStatus, String> {
    let handle_guard = state.poll_task_handle.lock().await;
    let st = state.poll_state.lock().await;
    Ok(PollingStatus {
        running: handle_guard.is_some(),
        paused: st.paused,
        last_sync_at: st.last_sync_at.clone(),
    })
}

async fn notify_polling_sync_completed(state: &PluginState) {
    let guard = state.poll_control_tx.lock().await;
    if let Some(tx) = guard.as_ref() {
        let _ = tx.send(ControlMsg::SyncCompleted).await;
    }
}

fn sync_now_result_has_data_changed(result: &SyncNowResult) -> bool {
    result
        .pull
        .as_ref()
        .is_some_and(|pull| pull.rows_received > 0)
        || result
            .push
            .as_ref()
            .is_some_and(|push| !push.tables_synced.is_empty())
}

fn schedule_control_msg(state: &PluginState, msg: ControlMsg) {
    if state.poll_on_background {
        return;
    }

    if let Ok(guard) = state.poll_control_tx.try_lock() {
        if let Some(tx) = guard.as_ref() {
            let tx = tx.clone();
            tauri::async_runtime::spawn(async move {
                let _ = tx.send(msg).await;
            });
        }
    }
}

pub fn handle_run_event<R: Runtime>(app: &AppHandle<R>, event: &RunEvent) {
    let state = app.state::<PluginState>();
    handle_run_event_for_state(&state, event);
}

pub fn handle_run_event_for_state(state: &PluginState, event: &RunEvent) {
    if state.poll_on_background {
        return;
    }

    match event {
        RunEvent::WindowEvent {
            event: WindowEvent::Focused(focused),
            ..
        } => {
            handle_window_focus_for_state(state, *focused);
        }
        RunEvent::Resumed => {
            schedule_control_msg(state, ControlMsg::Resume);
        }
        _ => {}
    }
}

pub fn handle_window_focus_for_state(state: &PluginState, focused: bool) {
    if state.poll_on_background {
        return;
    }

    if focused {
        schedule_control_msg(state, ControlMsg::Resume);
    } else {
        schedule_control_msg(state, ControlMsg::Pause);
    }
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
        let _ = super::start_polling;
        let _ = super::stop_polling;
        let _ = super::pause_polling;
        let _ = super::resume_polling;
        let _ = super::get_polling_status;
    }
}
