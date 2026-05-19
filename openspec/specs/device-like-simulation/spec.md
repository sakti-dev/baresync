## Purpose

TBD

## Requirements

### Requirement: Plugin command host simulation

The system SHALL provide host-runnable tests for the Tauri plugin command surface without requiring Android, adb, a WebView, or a running desktop Tauri app.

#### Scenario: DB proxy command simulation

- **WHEN** plugin command tests call the DB proxy command handlers with test state
- **THEN** `run_sql`, `run_sql_batch`, and `get_db_info` SHALL exercise the shared SQLite pool and return the same result shape exposed to Tauri callers

#### Scenario: Migration command simulation

- **WHEN** plugin command tests call migration command handlers with embedded test migrations
- **THEN** `run_migrations` SHALL apply pending migrations and `get_migration_status` SHALL report applied records

#### Scenario: Sync maintenance command simulation

- **WHEN** plugin command tests call sync maintenance command handlers with seeded local state
- **THEN** local state, synced outbox purge, and garbage collection commands SHALL return deterministic results without external network access

### Requirement: JS invoke simulation

The system SHALL provide JS client tests that simulate Tauri IPC through an injected `invoke` function.

#### Scenario: Command payload simulation

- **WHEN** JS client tests call sync client methods with a mocked `invoke`
- **THEN** each method SHALL call the expected Tauri command with the configured `scopeId`

#### Scenario: Result and error propagation

- **WHEN** the mocked `invoke` resolves or rejects
- **THEN** the JS client method SHALL propagate the same result or error to the caller

### Requirement: Opt-in smoke scaffolding

The system SHALL provide desktop and Android smoke test entry points that drive the public Baresync fixture app and remain excluded from normal verification by default.

#### Scenario: Desktop smoke automation

- **WHEN** a developer runs the desktop smoke command with the required local tooling and fixture app build
- **THEN** the smoke flow SHALL launch the public fixture app through Tauri desktop infrastructure and validate plugin registration, Tauri IPC, embedded migrations, Drizzle proxy reads, local SQLite persistence, baseline pull, local create, push, and restart behavior

#### Scenario: Android smoke automation

- **WHEN** a developer runs the Android smoke command with Maestro and a prepared fixture app/device
- **THEN** the smoke flow SHALL launch the public fixture app and validate Android lifecycle and filesystem confidence for SQLite initialization, baseline pull, local persistence, manual sync, and clean app-data reset behavior

### Requirement: Device simulation documentation

The system SHALL document which Phase 14 checks run in normal CI and which checks are optional manual smoke tests.

#### Scenario: Normal CI scope is explicit

- **WHEN** a developer reads the device simulation documentation
- **THEN** it SHALL state that command and JS simulation tests run on host, while desktop and Android smoke tests are opt-in
