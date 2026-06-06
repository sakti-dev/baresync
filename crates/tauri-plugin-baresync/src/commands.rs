use baresync_core::config::SyncEngineConfig;
use baresync_core::engine::{SyncContractTables, SyncEngine, SyncNowResult};
use baresync_core::headers::SyncRequestHeaders;
use baresync_core::migrations::{self, EmbeddedMigration, MigrationConfig, MigrationRecord};
use baresync_core::state::LocalSyncState;

use baresync_core::drizzle_proxy::{self, BatchResult, SqlQuery, SqlStatement};
use baresync_core::pull::PullResult;
use baresync_core::push::PushResult;

use baresync_core::db::DbClient;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
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
    pub sql_transaction_depth: Arc<AtomicUsize>,
    pub sql_transaction_has_writes: Arc<AtomicBool>,
    pub poll_control_tx: tokio::sync::Mutex<Option<mpsc::Sender<ControlMsg>>>,
    pub poll_task_handle: tokio::sync::Mutex<Option<tokio::task::JoinHandle<()>>>,
    pub poll_state: Arc<tokio::sync::Mutex<PollingState>>,
    pub poll_interval_secs: u64,
    pub poll_on_background: bool,
    pub event_sink: Arc<dyn PluginEventSink>,
    pub custom_headers: SyncRequestHeaders,
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

fn try_begin_sync(state: &PluginState) -> Result<SyncGuard<'_>, String> {
    if state
        .sync_in_progress
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err("Sync already in progress".to_string());
    }

    Ok(SyncGuard { state })
}

struct SyncGuard<'a> {
    state: &'a PluginState,
}

impl Drop for SyncGuard<'_> {
    fn drop(&mut self) {
        self.state.sync_in_progress.store(false, Ordering::Release);
    }
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SqlTransactionAction {
    Begin,
    Commit,
    Rollback,
    Other,
}

fn classify_sql_transaction_action(sql: &str) -> SqlTransactionAction {
    let first_word = sql
        .trim_start()
        .split(|ch: char| ch.is_whitespace() || ch == ';')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();

    match first_word.as_str() {
        "begin" | "savepoint" => SqlTransactionAction::Begin,
        "commit" | "release" => SqlTransactionAction::Commit,
        "rollback" => SqlTransactionAction::Rollback,
        _ => SqlTransactionAction::Other,
    }
}

fn should_notify_after_sql(
    state: &PluginState,
    method: &str,
    transaction_action: SqlTransactionAction,
    rows_affected: u64,
) -> bool {
    if method != "run" {
        return false;
    }

    match transaction_action {
        SqlTransactionAction::Begin => {
            state.sql_transaction_depth.fetch_add(1, Ordering::AcqRel);
            false
        }
        SqlTransactionAction::Commit => {
            let previous_depth = state.sql_transaction_depth.load(Ordering::Acquire);
            if previous_depth > 0 {
                state.sql_transaction_depth.fetch_sub(1, Ordering::AcqRel);
            }
            previous_depth <= 1
                && state
                    .sql_transaction_has_writes
                    .swap(false, Ordering::AcqRel)
        }
        SqlTransactionAction::Rollback => {
            state.sql_transaction_depth.store(0, Ordering::Release);
            state
                .sql_transaction_has_writes
                .store(false, Ordering::Release);
            false
        }
        SqlTransactionAction::Other => {
            if rows_affected == 0 {
                return false;
            }

            if state.sql_transaction_depth.load(Ordering::Acquire) > 0 {
                state
                    .sql_transaction_has_writes
                    .store(true, Ordering::Release);
                return false;
            }

            true
        }
    }
}

#[command]
pub async fn run_sql(
    query: SqlQuery,
    state: State<'_, PluginState>,
) -> Result<Vec<drizzle_proxy::SqlRow>, String> {
    let method = query.method.clone();
    let transaction_action = classify_sql_transaction_action(&query.sql);
    let result = drizzle_proxy::run_sql_with_metadata(&state.db, query)
        .await
        .map_err(|e| e.to_string());
    if let Ok(execution) = &result {
        if execution.rows_affected > 0 {
            state.event_sink.emit(PluginEvent::DataChanged);
        }
    }
    if result
        .as_ref()
        .is_ok_and(|execution| {
            should_notify_after_sql(
                &state,
                &method,
                transaction_action,
                execution.rows_affected,
            )
        })
    {
        state.poll_notify.notify_one();
    }
    result.map(|execution| execution.rows)
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
        crate::builder::run_path_migrations(&state.db, &config, path)
            .await
            .map_err(|error| error.to_string())
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
    let _guard = try_begin_sync(state)?;
    let engine = make_engine(state, scope_id.clone()).await;
    let result = engine.sync_now(1000).await.map_err(|e| {
        log::error!("[baresync] sync_now error: {}", e);
        e.to_string()
    });
    if let Ok(sync_result) = &result {
        log::info!("[baresync] sync_now completed: mode={:?}", sync_result.mode);
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
    let _guard = try_begin_sync(state)?;
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
    let _guard = try_begin_sync(state)?;
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
    let _guard = try_begin_sync(state)?;
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
            log::warn!("[baresync] start_polling: already running for scope_id={}", scope_id);
            return Ok(());
        }
    }

    log::info!(
        "[baresync] start_polling: scope_id={}, interval={}s",
        scope_id,
        state.poll_interval_secs
    );

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

pub async fn set_headers_with_state(
    state: &PluginState,
    headers: Vec<(String, String)>,
) -> Result<(), String> {
    state
        .custom_headers
        .replace(&headers)
        .map_err(|e| e.to_string())
}

#[command]
pub async fn set_headers(
    state: State<'_, PluginState>,
    headers: Vec<(String, String)>,
) -> Result<(), String> {
    set_headers_with_state(&state, headers).await
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
    use super::*;
    use std::path::PathBuf;

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
        let _ = super::set_headers;
    }

    async fn test_state() -> PluginState {
        let db = DbClient::connect(":memory:").await.unwrap();

        PluginState {
            db: Arc::new(db),
            sync_config: SyncEngineConfig::default(),
            contract_tables: SyncContractTables {
                upsert_order: Vec::new(),
                delete_order: Vec::new(),
                local_only_columns: Vec::new(),
            },
            db_path: PathBuf::from(":memory:"),
            embedded_migrations: Arc::new(Vec::new()),
            migrations_path: None,
            poll_notify: Arc::new(Notify::new()),
            sync_in_progress: Arc::new(AtomicBool::new(false)),
            sql_transaction_depth: Arc::new(AtomicUsize::new(0)),
            sql_transaction_has_writes: Arc::new(AtomicBool::new(false)),
            poll_control_tx: tokio::sync::Mutex::new(None),
            poll_task_handle: tokio::sync::Mutex::new(None),
            poll_state: Arc::new(tokio::sync::Mutex::new(PollingState {
                paused: false,
                last_sync_at: None,
            })),
            poll_interval_secs: 30,
            poll_on_background: false,
            event_sink: Arc::new(NoopPluginEventSink),
            custom_headers: SyncRequestHeaders::new(),
        }
    }

    #[tokio::test]
    async fn transaction_writes_notify_only_after_commit() {
        let state = test_state().await;

        assert!(!should_notify_after_sql(
            &state,
            "run",
            classify_sql_transaction_action("begin"),
            0
        ));
        assert!(!should_notify_after_sql(
            &state,
            "run",
            classify_sql_transaction_action("insert into items values ('1')"),
            1
        ));
        assert!(!should_notify_after_sql(
            &state,
            "run",
            classify_sql_transaction_action("insert into sync_outbox values ('1')"),
            1
        ));

        assert!(should_notify_after_sql(
            &state,
            "run",
            classify_sql_transaction_action("commit"),
            0
        ));
        assert_eq!(state.sql_transaction_depth.load(Ordering::Acquire), 0);
        assert!(!state.sql_transaction_has_writes.load(Ordering::Acquire));
    }

    #[tokio::test]
    async fn rollback_clears_pending_transaction_notification() {
        let state = test_state().await;

        assert!(!should_notify_after_sql(
            &state,
            "run",
            classify_sql_transaction_action("begin"),
            0
        ));
        assert!(!should_notify_after_sql(
            &state,
            "run",
            classify_sql_transaction_action("update items set name = 'Coffee'"),
            1
        ));

        assert!(!should_notify_after_sql(
            &state,
            "run",
            classify_sql_transaction_action("rollback"),
            0
        ));
        assert_eq!(state.sql_transaction_depth.load(Ordering::Acquire), 0);
        assert!(!state.sql_transaction_has_writes.load(Ordering::Acquire));
    }

    #[tokio::test]
    async fn standalone_write_notifies_immediately() {
        let state = test_state().await;

        assert!(should_notify_after_sql(
            &state,
            "run",
            classify_sql_transaction_action("insert into items values ('1')"),
            1
        ));
    }

    #[tokio::test]
    async fn set_headers_stores_valid_headers() {
        let state = test_state().await;
        set_headers_with_state(&state, vec![
            ("Authorization".to_string(), "Bearer token-1".to_string()),
            ("X-Api-Key".to_string(), "key-1".to_string()),
        ])
        .await
        .unwrap();

        let snapshot = state.custom_headers.snapshot();
        assert_eq!(snapshot.get("authorization").unwrap(), "Bearer token-1");
        assert_eq!(snapshot.get("x-api-key").unwrap(), "key-1");
    }

    #[tokio::test]
    async fn set_headers_clears_headers_with_empty_vec() {
        let state = test_state().await;
        set_headers_with_state(&state, vec![
            ("Authorization".to_string(), "Bearer token".to_string()),
        ])
        .await
        .unwrap();

        set_headers_with_state(&state, vec![]).await.unwrap();

        let snapshot = state.custom_headers.snapshot();
        assert!(snapshot.is_empty());
    }

    #[tokio::test]
    async fn set_headers_rejects_invalid_header_name() {
        let state = test_state().await;
        let result = set_headers_with_state(&state, vec![
            ("Invalid Name!".to_string(), "value".to_string()),
        ])
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn set_headers_rejects_invalid_header_value() {
        let state = test_state().await;
        let result = set_headers_with_state(&state, vec![
            ("X-Test".to_string(), "value\nwith\nnewlines".to_string()),
        ])
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn set_headers_preserves_old_headers_on_failed_validation() {
        let state = test_state().await;
        set_headers_with_state(&state, vec![
            ("Authorization".to_string(), "Bearer valid".to_string()),
        ])
        .await
        .unwrap();

        let result = set_headers_with_state(&state, vec![
            ("Invalid Name!".to_string(), "value".to_string()),
        ])
        .await;
        assert!(result.is_err());

        let snapshot = state.custom_headers.snapshot();
        assert_eq!(snapshot.get("authorization").unwrap(), "Bearer valid");
    }

    #[tokio::test]
    async fn js_command_and_rust_host_write_same_store() {
        let state = test_state().await;

        set_headers_with_state(&state, vec![
            ("Authorization".to_string(), "Bearer rust-host".to_string()),
        ])
        .await
        .unwrap();

        let snapshot = state.custom_headers.snapshot();
        assert_eq!(snapshot.get("authorization").unwrap(), "Bearer rust-host");

        set_headers_with_state(&state, vec![
            ("Authorization".to_string(), "Bearer js-command".to_string()),
        ])
        .await
        .unwrap();

        let snapshot = state.custom_headers.snapshot();
        assert_eq!(snapshot.get("authorization").unwrap(), "Bearer js-command");
    }
}
