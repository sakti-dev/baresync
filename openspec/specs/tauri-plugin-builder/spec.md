## MODIFIED Requirements

### Requirement: DB proxy commands

The plugin SHALL expose `run_sql`, `run_sql_batch`, and `get_db_info` Tauri commands that delegate to `baresync-core` DB functions using the plugin's pool.

#### Scenario: run_sql through plugin

- **WHEN** the JS client calls `invoke("run_sql", { query })`
- **THEN** the plugin SHALL execute the query using the shared pool and return rows

#### Scenario: run_sql_batch through plugin

- **WHEN** the JS client calls `invoke("run_sql_batch", { statements })`
- **THEN** the plugin SHALL execute all statements in a transaction and return the batch result

## ADDED Requirements

### Requirement: run_migrations command

The plugin SHALL expose a `run_migrations` Tauri command that calls `baresync-core` migration runner using the plugin's pool and embedded migrations.

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

### Requirement: Builder accepts migrations directory

The `Builder` SHALL accept a `migrations_dir` method that configures the path to SQL migration files for embedding.

#### Scenario: Builder with migrations

- **WHEN** `Builder::new().api_base_url("...").migrations_dir("./drizzle").build()` is called
- **THEN** the plugin SHALL embed and register the migrations from the specified directory

### Requirement: Host-callable plugin command logic
The Tauri plugin command surface SHALL be testable from host Rust tests without launching a full Tauri app or WebView.

#### Scenario: Construct command test state
- **WHEN** a Rust test constructs plugin command state with a temporary SQLite database, sync config, contract tables, DB path, and embedded migrations
- **THEN** command logic SHALL be callable with that state and return command-compatible result values

#### Scenario: Exercise command behavior through host tests
- **WHEN** host tests call DB, migration, local state, outbox purge, and garbage collection command behavior
- **THEN** the tests SHALL exercise the same core functions used by the Tauri command handlers

#### Scenario: Avoid mandatory device dependencies
- **WHEN** `cargo test -p tauri-plugin-baresync --test commands` runs in normal development or CI
- **THEN** the tests SHALL pass without Android, adb, a WebView, desktop driver infrastructure, or network access

### Requirement: Consumer plugin registration contract
The Tauri plugin builder integration SHALL document the required configuration a consumer app must provide for production-like sync behavior.

#### Scenario: Required builder inputs documented
- **WHEN** a consumer reads plugin registration guidance
- **THEN** it SHALL describe API base URL, encoding, max push bytes, max push rows, DB path, contract table metadata, and embedded migrations as explicit integration inputs

#### Scenario: Builder config avoids hidden app coupling
- **WHEN** a consumer registers the plugin
- **THEN** the documented pattern SHALL NOT require private app modules, fixture app modules, or Sakti-specific command handlers

### Requirement: Plugin integration diagnostics
The plugin integration SHALL provide documented or testable diagnostics for confirming registration and configuration.

#### Scenario: Registration smoke check
- **WHEN** a consumer runs integration preflight
- **THEN** it SHALL be possible to confirm that DB, migration, local state, and sync commands are callable through the registered plugin

#### Scenario: Config mismatch is actionable
- **WHEN** a consumer misconfigures encoding, API URL, DB path, limits, migrations, or contract table metadata
- **THEN** the integration guidance or helper checks SHALL identify the likely mismatch before full device smoke validation where practical
