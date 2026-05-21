## ADDED Requirements

### Requirement: DB proxy data change events
The plugin SHALL emit data-change events from DB proxy commands only when SQL execution reports affected rows.

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

### Requirement: Host-testable event emission
The plugin command logic SHALL support testing emitted events from host Rust tests without launching a full Tauri app or WebView.

#### Scenario: Host test records emitted events
- **WHEN** a Rust host test constructs plugin command state with an in-memory event recorder
- **THEN** command logic SHALL record emitted `baresync://data-changed` and `baresync://sync-status-changed` events in that recorder

#### Scenario: Tauri app emits through app handle
- **WHEN** the plugin is registered in a Tauri app
- **THEN** emitted plugin events SHALL be delivered through the Tauri event system
