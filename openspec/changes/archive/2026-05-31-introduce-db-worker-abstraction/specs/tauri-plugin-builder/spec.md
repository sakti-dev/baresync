## MODIFIED Requirements

### Requirement: DB proxy commands

The plugin SHALL expose `run_sql`, `run_sql_batch`, and `get_db_info` Tauri commands that delegate to `baresync-core` DB functions using the plugin's `DbClient`.

#### Scenario: run_sql through plugin

- **WHEN** the JS client calls `invoke("run_sql", { query })`
- **THEN** the plugin SHALL execute the query using the shared database client and return rows

#### Scenario: run_sql_batch through plugin

- **WHEN** the JS client calls `invoke("run_sql_batch", { statements })`
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
- **THEN** setup SHALL connect to SQLite through `DbClient`, apply all pending migrations, and only then manage `PluginState`

#### Scenario: setup migration failure stops startup

- **WHEN** a configured migration fails during plugin setup
- **THEN** setup SHALL return an error instead of exposing a partially initialized plugin state

### Requirement: run_migrations command

The plugin SHALL expose a `run_migrations` Tauri command that calls `baresync-core` migration runner using the plugin's `DbClient` and configured migrations.

#### Scenario: run_migrations through plugin

- **WHEN** the JS client calls `invoke("run_migrations")`
- **THEN** the plugin SHALL execute all pending migrations and return success or error

#### Scenario: run_migrations idempotent

- **WHEN** `run_migrations` is called after migrations have already been applied
- **THEN** the command SHALL return success without re-executing migrations

### Requirement: get_migration_status command

The plugin SHALL expose a `get_migration_status` Tauri command that returns the list of applied migrations.

#### Scenario: get_migration_status through plugin

- **WHEN** the JS client calls `invoke("get_migration_status")`
- **THEN** the plugin SHALL return the list of applied migration hashes and timestamps

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
