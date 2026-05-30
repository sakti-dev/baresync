## MODIFIED Requirements

### Requirement: DB proxy commands

The plugin SHALL expose `run_sql`, `run_sql_batch`, and `get_db_info` Tauri commands that delegate to `baresync-core` DB functions using the plugin's `rusqlite` worker-backed `DbClient`.

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
- **THEN** setup SHALL connect to SQLite through the `rusqlite` worker-backed `DbClient`, apply all pending migrations, and only then manage `PluginState`

#### Scenario: setup migration failure stops startup

- **WHEN** a configured migration fails during plugin setup
- **THEN** setup SHALL return an error instead of exposing a partially initialized plugin state
