## ADDED Requirements

### Requirement: Builder pattern for plugin registration
The Tauri plugin crate SHALL expose a `Builder` struct with methods `api_base_url`, `max_push_bytes`, `max_push_rows`, `db_path`, and `contract_tables`. The `build` method SHALL return a `TauriPlugin` that registers all plugin commands and manages plugin state.

#### Scenario: Plugin registration with Builder
- **WHEN** a consumer calls `tauri_plugin_baresync::Builder::new().api_base_url("https://api.example.com").build()`
- **THEN** a `TauriPlugin` SHALL be returned that registers all 10 plugin commands

#### Scenario: Builder uses defaults for unset fields
- **WHEN** a consumer calls `Builder::new().api_base_url("...").build()` without setting `max_push_bytes` or `max_push_rows`
- **THEN** defaults SHALL be `256 * 1024` bytes and `2000` rows respectively

### Requirement: Plugin state management
The plugin SHALL manage a `PluginState` struct (defined in `commands.rs`) containing an `Arc<SqlitePool>`, `SyncEngineConfig`, `SyncContractTables`, and `db_path: PathBuf`. The pool SHALL be initialized during plugin setup using the configured `db_path`.

#### Scenario: Plugin state initialized on app startup
- **WHEN** the Tauri app starts with the baresync plugin registered
- **THEN** the plugin SHALL connect to the SQLite database at the configured path, create the pool, and store it in plugin state

#### Scenario: Plugin state accessible from commands
- **WHEN** a plugin command is invoked
- **THEN** it SHALL access the `PluginState` via Tauri's `State` extractor

### Requirement: sync_now command
The plugin SHALL expose a `sync_now` Tauri command that calls `SyncEngine::sync_now` and returns `SyncNowResult`.

#### Scenario: sync_now command invocation
- **WHEN** the JS client calls `invoke("sync_now", { scopeId })`
- **THEN** the plugin SHALL execute the full sync cycle and return the result

### Requirement: sync_push command
The plugin SHALL expose a `sync_push` Tauri command that calls `SyncEngine::push` and returns `PushResult`.

#### Scenario: sync_push command invocation
- **WHEN** the JS client calls `invoke("sync_push", { scopeId })`
- **THEN** the plugin SHALL push all unsynced outbox rows and return the result

### Requirement: sync_pull command
The plugin SHALL expose a `sync_pull` Tauri command that calls `SyncEngine::pull` and returns `PullResult`.

#### Scenario: sync_pull command invocation
- **WHEN** the JS client calls `invoke("sync_pull", { scopeId })`
- **THEN** the plugin SHALL pull changed rows and return the result

### Requirement: sync_full_resync command
The plugin SHALL expose a `sync_full_resync` Tauri command that calls `SyncEngine::sync_full_resync` and returns `SyncNowResult`.

#### Scenario: sync_full_resync command invocation
- **WHEN** the JS client calls `invoke("sync_full_resync", { scopeId })`
- **THEN** the plugin SHALL perform a baseline pull + push + GC and return the result

### Requirement: get_sync_local_state command
The plugin SHALL expose a `get_sync_local_state` Tauri command that calls `SyncEngine::get_sync_local_state` and returns `LocalSyncState`.

#### Scenario: get_sync_local_state command invocation
- **WHEN** the JS client calls `invoke("get_sync_local_state", { scopeId })`
- **THEN** the plugin SHALL return the dirty count, cursor, and baseline flag

### Requirement: purge_synced_outbox command
The plugin SHALL expose a `purge_synced_outbox` Tauri command that calls `SyncEngine::purge_synced_outbox` and returns the count of purged rows.

#### Scenario: purge_synced_outbox command invocation
- **WHEN** the JS client calls `invoke("purge_synced_outbox", { olderThan })`
- **THEN** the plugin SHALL delete old synced outbox entries and return the count

### Requirement: run_garbage_collection command
The plugin SHALL expose a `run_garbage_collection` Tauri command that calls `SyncEngine::run_garbage_collection` and returns the count of purged rows.

#### Scenario: run_garbage_collection command invocation
- **WHEN** the JS client calls `invoke("run_garbage_collection", { scopeId })`
- **THEN** the plugin SHALL purge soft-deleted synced rows and return the count

### Requirement: DB proxy commands
The plugin SHALL expose `run_sql`, `run_sql_batch`, and `get_db_info` Tauri commands that delegate to `baresync-core` DB functions using the plugin's pool.

#### Scenario: run_sql through plugin
- **WHEN** the JS client calls `invoke("run_sql", { query })`
- **THEN** the plugin SHALL execute the query using the shared pool and return rows

#### Scenario: run_sql_batch through plugin
- **WHEN** the JS client calls `invoke("run_sql_batch", { statements })`
- **THEN** the plugin SHALL execute all statements in a transaction and return the batch result
