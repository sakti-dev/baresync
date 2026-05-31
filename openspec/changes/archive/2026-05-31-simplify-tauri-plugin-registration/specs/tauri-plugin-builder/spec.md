## ADDED Requirements

### Requirement: Plugin-owned command registration

The plugin SHALL register Baresync DB, migration, sync, and polling Tauri commands when `Builder::build()` is registered as a Tauri plugin.

#### Scenario: Commands callable through plugin namespace

- **WHEN** a consumer app registers `tauri_plugin_baresync::builder::Builder::new().build()`
- **THEN** `run_sql`, `run_sql_batch`, `get_db_info`, `run_migrations`, `get_migration_status`, `sync_now`, `sync_push`, `sync_pull`, `sync_full_resync`, `get_sync_local_state`, `purge_synced_outbox`, `run_garbage_collection`, `start_polling`, `stop_polling`, `pause_polling`, `resume_polling`, and `get_polling_status` SHALL be callable through the Tauri plugin command namespace
- **AND** the consumer app SHALL NOT be required to define app-local `#[command]` wrappers for those commands

#### Scenario: Host-callable command logic remains available

- **WHEN** Rust host tests call command logic directly with constructed plugin state
- **THEN** the same command behavior SHALL remain testable without launching a Tauri app or WebView

### Requirement: Builder accepts generated contract metadata

The `Builder` SHALL accept generated sync contract metadata and derive `SyncContractTables` from it.

#### Scenario: Builder derives table order from generated metadata

- **WHEN** a consumer configures the builder with generated contract metadata containing upsert order, delete order, and local-only columns
- **THEN** plugin setup SHALL store equivalent `SyncContractTables` in managed plugin state
- **AND** the consumer app SHALL NOT be required to manually duplicate table order in Rust

#### Scenario: Builder rejects incomplete contract metadata

- **WHEN** generated contract metadata is missing table order or local-only column information required by the runtime
- **THEN** plugin setup SHALL fail with an actionable error describing the missing metadata

#### Scenario: Explicit contract tables remain supported

- **WHEN** a consumer configures the builder with `contract_tables(...)`
- **THEN** the plugin SHALL use those explicit tables without requiring generated metadata

### Requirement: Builder accepts app-data database name

The `Builder` SHALL accept a database file name for normal app usage and resolve it under the Tauri app data directory during plugin setup.

#### Scenario: Builder resolves database name under app data

- **WHEN** a consumer configures `Builder::new().db_name("todo.db").build()`
- **THEN** plugin setup SHALL resolve `todo.db` under the Tauri app data directory
- **AND** plugin setup SHALL create required parent directories before connecting to SQLite

#### Scenario: Explicit database path takes precedence

- **WHEN** a consumer configures `db_path(...)`
- **THEN** plugin setup SHALL use the explicit database path instead of app-data name resolution

## MODIFIED Requirements

### Requirement: Consumer plugin registration contract
The Tauri plugin builder integration SHALL document the required configuration a consumer app must provide for production-like sync behavior.

#### Scenario: Required builder inputs documented
- **WHEN** a consumer reads plugin registration guidance
- **THEN** it SHALL describe API base URL, encoding, max push bytes, max push rows, DB path or DB name, generated contract metadata, and migration source as explicit integration inputs

#### Scenario: Builder config avoids hidden app coupling
- **WHEN** a consumer registers the plugin
- **THEN** the documented pattern SHALL NOT require private app modules, fixture app modules, Sakti-specific command handlers, or app-local wrappers for Baresync plugin commands
