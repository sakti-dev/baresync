## ADDED Requirements

### Requirement: Rust coverage reports are available per crate
The workspace SHALL provide reproducible Rust coverage reports for `baresync-core` and `tauri-plugin-baresync`, with each crate reported separately when a combined workspace report is impractical.

#### Scenario: Per-crate coverage reports are generated
- **WHEN** the Rust coverage command is run for the workspace
- **THEN** coverage output SHALL include line and function coverage for `baresync-core`
- **AND** coverage output SHALL include line and function coverage for `tauri-plugin-baresync`

### Requirement: Rust coverage minimums are enforced
The Rust coverage workflow SHALL enforce minimum line coverage thresholds for the workspace crates.

#### Scenario: Coverage meets minimums
- **WHEN** `baresync-core` coverage is at or above 70% line coverage and `tauri-plugin-baresync` coverage is at or above 55% line coverage
- **THEN** the Rust coverage check SHALL pass

#### Scenario: Coverage drops below minimums
- **WHEN** either crate falls below its minimum line coverage threshold
- **THEN** the Rust coverage check SHALL fail with a non-zero exit code
- **AND** the failing crate SHALL be identified in the output

### Requirement: Core Rust sync paths remain heavily covered
The `baresync-core` test suite SHALL include coverage for the sync-critical Rust paths that govern push, pull, status, idempotency, pagination, deletes, cursor progression, protobuf encode/decode boundaries, and error mapping.

#### Scenario: Core sync behavior is exercised by tests
- **WHEN** the `baresync-core` test suite runs
- **THEN** it SHALL exercise push and pull lifecycle behavior
- **AND** it SHALL exercise status and cursor progression behavior
- **AND** it SHALL exercise protobuf request and response handling
- **AND** it SHALL exercise representative failure and reconciliation cases

### Requirement: Plugin Rust wiring remains host-testable
The `tauri-plugin-baresync` test suite SHALL cover builder configuration, explicit transport selection, migration startup behavior, command wiring, and host-callable event logic without requiring Android, a WebView, or external device infrastructure.

#### Scenario: Plugin logic is testable from host Rust tests
- **WHEN** the plugin host test suite runs
- **THEN** it SHALL validate builder and command behavior from Rust tests
- **AND** it SHALL validate transport selection and migration setup paths
- **AND** it SHALL validate event emission or state transitions through host-side test helpers
