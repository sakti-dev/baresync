## Purpose

Tauri plugin builder configuration and command behavior for Baresync apps.

## Requirements

### Requirement: DB proxy commands

The plugin SHALL expose `run_sql`, `run_sql_batch`, and `get_db_info` Tauri commands that delegate to `baresync-core` DB functions using the plugin's pool.

#### Scenario: run_sql through plugin

- **WHEN** the JS client calls `invoke("run_sql", { query })`
- **THEN** the plugin SHALL execute the query using the shared pool and return rows

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
- **THEN** setup SHALL connect to SQLite, apply all pending migrations, and only then manage `PluginState`

#### Scenario: setup migration failure stops startup

- **WHEN** a configured migration fails during plugin setup
- **THEN** setup SHALL return an error instead of exposing a partially initialized plugin state

### Requirement: run_migrations command

The plugin SHALL expose a `run_migrations` Tauri command that calls `baresync-core` migration runner using the plugin's pool and configured migrations.

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

- **WHEN** the JS client calls `invoke("start_polling", { scopeId: "outlet-1" })`
- **THEN** the plugin SHALL start the background polling task for the given scope

#### Scenario: stop_polling command

- **WHEN** the JS client calls `invoke("stop_polling")`
- **THEN** the plugin SHALL stop the background polling task

#### Scenario: pause_polling command

- **WHEN** the JS client calls `invoke("pause_polling")`
- **THEN** the plugin SHALL pause the polling task without destroying it

#### Scenario: resume_polling command

- **WHEN** the JS client calls `invoke("resume_polling")`
- **THEN** the plugin SHALL resume a paused polling task

#### Scenario: get_polling_status command

- **WHEN** the JS client calls `invoke("get_polling_status")`
- **THEN** the plugin SHALL return the current polling state

### Requirement: Write notification on SQL execution

The `run_sql` and `run_sql_batch` commands SHALL notify the polling task after execution.

#### Scenario: run_sql notifies polling

- **WHEN** `invoke("run_sql", { query: ... })` completes successfully
- **THEN** the plugin SHALL signal the polling task to consider an immediate push

#### Scenario: run_sql_batch notifies polling

- **WHEN** `invoke("run_sql_batch", { statements: ... })` completes successfully
- **THEN** the plugin SHALL signal the polling task to consider an immediate push

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

### Requirement: Protobuf encoding requires explicit transport

The Tauri plugin builder SHALL reject or fail setup for `encoding: "protobuf"` when no explicit sync HTTP transport has been configured.

The failure SHALL be actionable and explain that protobuf sync requires a schema-specific generated protobuf transport. JSON encoding SHALL continue to use `JsonHttpTransport` by default when no explicit transport is provided.

#### Scenario: Protobuf encoding without transport fails

- **WHEN** a consumer registers the plugin with `.encoding("protobuf")` and does not configure `.transport(...)`
- **THEN** plugin build or setup SHALL fail before sync commands can send network requests
- **AND** the error message SHALL tell the consumer to pass the generated protobuf transport

#### Scenario: JSON encoding keeps default transport

- **WHEN** a consumer registers the plugin with `.encoding("json")` or omits encoding
- **THEN** the plugin SHALL use the default JSON transport unless a custom transport is explicitly configured

#### Scenario: Protobuf encoding with generated transport starts

- **WHEN** a consumer registers the plugin with `.encoding("protobuf")` and passes the generated protobuf transport to `.transport(...)`
- **THEN** plugin setup SHALL complete with that transport in the managed sync configuration

### Requirement: Protobuf plugin registration contract

The Tauri plugin builder integration SHALL document and test the public protobuf registration pattern for consumer apps.

The documented pattern SHALL include:

- Generated Rust protobuf module import
- `prost` dependency requirement
- `.encoding("protobuf")`
- `.transport(...)` using the generated protobuf transport type or factory
- Existing required DB path, migrations, contract table metadata, API URL, and limits

#### Scenario: Public docs show complete protobuf plugin wiring

- **WHEN** a consumer reads protobuf or plugin registration guidance
- **THEN** the guidance SHALL show plugin setup that includes the generated protobuf transport, not only `.encoding("protobuf")`

#### Scenario: Protobuf docs distinguish encoding from transport

- **WHEN** a consumer reads protobuf guidance
- **THEN** it SHALL state that `encoding: "protobuf"` alone does not provide schema-specific protobuf HTTP encoding unless the generated transport is wired

### Requirement: Transport mismatch diagnostics

The plugin integration SHALL provide actionable diagnostics for common protobuf transport mismatches.

#### Scenario: Protobuf server receives JSON due to bad wiring

- **WHEN** a consumer reports protobuf mode failing because the server receives JSON content
- **THEN** the troubleshooting guidance SHALL direct them to verify the generated transport import, `.transport(...)` builder call, content type, generated artifact freshness, and server handler `protobufSchema`

#### Scenario: Generated transport decode failure is diagnosable

- **WHEN** the generated protobuf transport fails to decode a server response
- **THEN** the surfaced error SHALL identify the sync request kind and that protobuf response decoding failed
