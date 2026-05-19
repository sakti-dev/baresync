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
