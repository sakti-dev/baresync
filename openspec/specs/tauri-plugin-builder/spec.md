## Purpose

Tauri plugin builder configuration and command behavior for Baresync apps.

## Requirements

### Requirement: Plugin-owned command registration

The plugin SHALL register Baresync DB, migration, sync, and polling Tauri commands when `Builder::build()` is registered as a Tauri plugin.

#### Scenario: Commands callable through plugin namespace

- **WHEN** a consumer app registers `tauri_plugin_baresync::builder::Builder::new().build()`
- **THEN** `run_sql`, `run_sql_batch`, `get_db_info`, `run_migrations`, `get_migration_status`, `sync_now`, `sync_push`, `sync_pull`, `sync_full_resync`, `get_sync_local_state`, `purge_synced_outbox`, `run_garbage_collection`, `start_polling`, `stop_polling`, `pause_polling`, `resume_polling`, and `get_polling_status` SHALL be callable through the Tauri plugin command namespace
- **AND** the consumer app SHALL NOT be required to define app-local `#[command]` wrappers for those commands

#### Scenario: Host-callable command logic remains available

- **WHEN** Rust host tests call command logic directly with constructed plugin state
- **THEN** the same command behavior SHALL remain testable without launching a Tauri app or WebView

### Requirement: DB proxy commands

The plugin SHALL expose `run_sql`, `run_sql_batch`, and `get_db_info` Tauri commands that delegate to `baresync-core` DB functions using the plugin's `rusqlite` worker-backed `DbClient`.

#### Scenario: run_sql through plugin

- **WHEN** the JS client calls `invoke("plugin:baresync|run_sql", { query })`
- **THEN** the plugin SHALL execute the query using the shared database client and return rows

#### Scenario: run_sql_batch through plugin

- **WHEN** the JS client calls `invoke("plugin:baresync|run_sql_batch", { statements })`
- **THEN** the plugin SHALL execute all statements in a transaction and return the batch result

#### Scenario: run_sql write with affected rows emits data changed

- **WHEN** `run_sql` executes a `method: "run"` query successfully and SQLite reports `rows_affected > 0`
- **THEN** the plugin SHALL emit `baresync://data-changed`
- **AND** the command response shape SHALL remain compatible with existing callers

#### Scenario: run_sql write without affected rows does not emit data changed

- **WHEN** `run_sql` executes a `method: "run"` query successfully and SQLite reports `rows_affected = 0`
- **THEN** the plugin SHALL NOT emit `baresync://data-changed`
- **AND** the command response shape SHALL remain compatible with existing callers

#### Scenario: run_sql read does not emit data changed

- **WHEN** `run_sql` executes a read query method that returns rows
- **THEN** the plugin SHALL NOT emit `baresync://data-changed`

#### Scenario: run_sql_batch emits data changed only with affected rows

- **WHEN** `run_sql_batch` completes successfully
- **THEN** the plugin SHALL emit `baresync://data-changed` only if the returned batch result has `rows_affected > 0`

### Requirement: Automatic migration startup

The plugin SHALL run configured migrations during plugin setup before exposing managed command state to JS.

#### Scenario: setup runs migrations

- **WHEN** the plugin is registered with embedded migrations or a migration path
- **THEN** setup SHALL connect to SQLite through the `rusqlite` worker-backed `DbClient`, apply all pending migrations, and only then manage `PluginState`

#### Scenario: setup migration failure stops startup

- **WHEN** a configured migration fails during plugin setup
- **THEN** setup SHALL return an error instead of exposing a partially initialized plugin state

### Requirement: run_migrations command

The plugin SHALL expose a `run_migrations` Tauri command that calls `baresync-core` migration runner using the plugin's `DbClient` and configured migrations.

#### Scenario: run_migrations through plugin

- **WHEN** the JS client calls `invoke("plugin:baresync|run_migrations")`
- **THEN** the plugin SHALL execute all pending migrations and return success or error

#### Scenario: run_migrations idempotent

- **WHEN** `run_migrations` is called after migrations have already been applied
- **THEN** the command SHALL return success without re-executing migrations

### Requirement: get_migration_status command

The plugin SHALL expose a `get_migration_status` Tauri command that returns the list of applied migrations.

#### Scenario: get_migration_status through plugin

- **WHEN** the JS client calls `invoke("plugin:baresync|get_migration_status")`
- **THEN** the plugin SHALL return the list of applied migration hashes and timestamps

### Requirement: Builder accepts migration path

The `Builder` SHALL accept a `migrations_path` method that configures a path to SQL migration files loaded by the Rust plugin.

#### Scenario: Builder with relative migration path

- **WHEN** `Builder::new().api_base_url("...").migrations_path("migrations").build()` is registered in a Tauri app
- **THEN** the plugin SHALL resolve `migrations` from the Tauri resource directory during setup
- **AND** the plugin SHALL apply `.sql` migrations in filename order during setup and explicit migration commands

#### Scenario: Builder with absolute migration path

- **WHEN** `Builder::new().api_base_url("...").migrations_path("/tmp/app-migrations").build()` is registered in a Tauri app
- **THEN** the plugin SHALL read migration files directly from `/tmp/app-migrations`
- **AND** the plugin SHALL apply `.sql` migrations in filename order during setup and explicit migration commands

### Requirement: Builder rejects multiple migration sources

The `Builder` SHALL reject configurations that provide both embedded migrations and a migration path.

#### Scenario: Embedded and path migrations configured together

- **WHEN** `Builder::new().migrations(vec![...]).migrations_path("migrations").build()` is registered in a Tauri app
- **THEN** plugin setup SHALL fail before exposing managed command state
- **AND** the error message SHALL tell the consumer to choose either embedded migrations or `migrations_path`

### Requirement: Polling config

The plugin builder SHALL accept polling-related configuration.

#### Scenario: Builder with polling config

- **WHEN** `Builder::new().poll_interval_secs(60).poll_on_background(false).build()` is called
- **THEN** the plugin SHALL store the polling configuration for use by the polling task

#### Scenario: Builder defaults for polling

- **WHEN** the builder is used without polling methods
- **THEN** `poll_interval_secs` SHALL default to 30 and `poll_on_background` SHALL default to `false`

### Requirement: Polling control commands

The plugin SHALL expose `start_polling`, `stop_polling`, `pause_polling`, `resume_polling`, and `get_polling_status` Tauri commands.

#### Scenario: start_polling command

- **WHEN** the JS client calls `invoke("plugin:baresync|start_polling", { scopeId: "outlet-1" })`
- **THEN** the plugin SHALL start the background polling task for the given scope

#### Scenario: stop_polling command

- **WHEN** the JS client calls `invoke("plugin:baresync|stop_polling")`
- **THEN** the plugin SHALL stop the background polling task

#### Scenario: pause_polling command

- **WHEN** the JS client calls `invoke("plugin:baresync|pause_polling")`
- **THEN** the plugin SHALL pause the polling task without destroying it

#### Scenario: resume_polling command

- **WHEN** the JS client calls `invoke("plugin:baresync|resume_polling")`
- **THEN** the plugin SHALL resume a paused polling task

#### Scenario: get_polling_status command

- **WHEN** the JS client calls `invoke("plugin:baresync|get_polling_status")`
- **THEN** the plugin SHALL return the current polling state

### Requirement: Write notification on SQL execution

The `run_sql` and `run_sql_batch` commands SHALL notify the polling task after execution.

#### Scenario: run_sql notifies polling

- **WHEN** `invoke("plugin:baresync|run_sql", { query: ... })` completes successfully
- **THEN** the plugin SHALL signal the polling task to consider an immediate push

#### Scenario: run_sql_batch notifies polling

- **WHEN** `invoke("plugin:baresync|run_sql_batch", { statements: ... })` completes successfully
- **THEN** the plugin SHALL signal the polling task to consider an immediate push

### Requirement: Host-callable plugin command logic
The Tauri plugin command surface SHALL be testable from host Rust tests without launching a full Tauri app or WebView.

#### Scenario: Construct command test state
- **WHEN** a Rust test constructs plugin command state with a temporary SQLite database client, sync config, contract tables, DB path, and embedded migrations
- **THEN** command logic SHALL be callable with that state and return command-compatible result values

#### Scenario: Exercise command behavior through host tests
- **WHEN** host tests call DB, migration, local state, outbox purge, and garbage collection command behavior
- **THEN** the tests SHALL exercise the same core functions used by the Tauri command handlers

#### Scenario: Avoid mandatory device dependencies
- **WHEN** `cargo test -p tauri-plugin-baresync --test commands` runs in normal development or CI
- **THEN** the tests SHALL pass without Android, adb, a WebView, desktop driver infrastructure, or network access

### Requirement: Host-testable event emission

The plugin command logic SHALL support testing emitted events from host Rust tests without launching a full Tauri app or WebView.

#### Scenario: Host test records emitted events

- **WHEN** a Rust host test constructs plugin command state with an in-memory event recorder
- **THEN** command logic SHALL record emitted `baresync://data-changed` and `baresync://sync-status-changed` events in that recorder

#### Scenario: Tauri app emits through app handle

- **WHEN** the plugin is registered in a Tauri app
- **THEN** emitted plugin events SHALL be delivered through the Tauri event system

### Requirement: Consumer plugin registration contract
The Tauri plugin builder integration SHALL document the required configuration a consumer app must provide for production-like sync behavior.

#### Scenario: Required builder inputs documented
- **WHEN** a consumer reads plugin registration guidance
- **THEN** it SHALL describe API base URL, DB path, generated contract metadata, and migration source as explicit integration inputs
- **AND** it SHALL NOT describe max push bytes, max push rows, transport, or db name as builder inputs — the sync engine uses safe defaults (256KB target, 2MB ceiling, 2000 rows) that work across all platforms, and JSON is the only supported encoding

#### Scenario: Builder config avoids hidden app coupling
- **WHEN** a consumer registers the plugin
- **THEN** the documented pattern SHALL NOT require private app modules, fixture app modules, Sakti-specific command handlers, or app-local wrappers for Baresync plugin commands

### Requirement: Plugin setup logging

The plugin SHALL log configuration and contract resolution at startup using the `log` crate.

#### Scenario: Plugin logs setup info

- **WHEN** the plugin is registered
- **THEN** it SHALL log api_url, db path, and contract tables (upsert_order, delete_order) at info level

#### Scenario: Polling logs errors instead of swallowing

- **WHEN** a polling sync cycle fails
- **THEN** the plugin SHALL log the error instead of silently discarding it

### Requirement: Plugin integration diagnostics
The plugin integration SHALL provide documented or testable diagnostics for confirming registration and configuration.

#### Scenario: Registration smoke check
- **WHEN** a consumer runs integration preflight
- **THEN** it SHALL be possible to confirm that DB, migration, local state, and sync commands are callable through the registered plugin

#### Scenario: Config mismatch is actionable
- **WHEN** a consumer misconfigures API URL, DB path, limits, migrations, or contract table metadata
- **THEN** the integration guidance or helper checks SHALL identify the likely mismatch before full device smoke validation where practical
