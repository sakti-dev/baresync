## MODIFIED Requirements

### Requirement: Deterministic fixture state
The system SHALL isolate fixture E2E state so desktop and Android smoke runs are repeatable and backed by deterministic fixture backend storage.

#### Scenario: Fresh run state reset
- **WHEN** a smoke run starts
- **THEN** the fixture app and test backend SHALL use deterministic IDs, deterministic seed data, and a clean local SQLite state for that run
- **AND** the fixture backend SHALL reset its SQLite-backed seed and pushed-row state before the smoke flow begins

#### Scenario: Restart persistence
- **WHEN** automation creates local fixture data and restarts the app
- **THEN** the fixture app SHALL display the same persisted local data from SQLite after restart

#### Scenario: Backend state reflects pushed rows
- **WHEN** automation performs a manual sync after creating local fixture rows
- **THEN** `GET /__state` on the fixture backend SHALL expose the pushed local category and product rows from backend storage

### Requirement: Public sync smoke scenarios
The system SHALL provide opt-in smoke scenarios that prove public Baresync integration across real Tauri boundaries and observable backend effects.

#### Scenario: Baseline pull
- **WHEN** the fixture app starts from a clean local database and automation triggers sync
- **THEN** server fixture rows SHALL be pulled into local SQLite and rendered by the fixture app
- **AND** baseline state SHALL be satisfied for the configured scope

#### Scenario: Local create and push
- **WHEN** automation creates a local fixture row while using the fixture app
- **THEN** the row SHALL persist locally, survive app restart, and push through the public sync client into the deterministic test backend
- **AND** the backend state endpoint SHALL show the pushed row IDs
- **AND** the fixture UI SHALL show accepted local rows as clean or synced after manual sync

#### Scenario: DB proxy and migration visibility
- **WHEN** automation runs the fixture smoke flow
- **THEN** the flow SHALL prove that embedded migrations completed and Drizzle proxy reads can query the local SQLite data through plugin commands

### Requirement: Public fixture smoke transport mode
The system SHALL allow the public fixture smoke harness and fixture app/backend wiring to run in either `json` or `protobuf` transport mode using a shared configuration source.

#### Scenario: Selected transport is propagated
- **WHEN** automation launches the fixture smoke in `protobuf` mode
- **THEN** the fixture app and SQLite-backed test backend SHALL use protobuf transport for sync request and response bodies
- **AND** the same smoke scenario SHALL remain executable in `json` mode without code changes

#### Scenario: Transport mode is visible to automation
- **WHEN** the fixture app is launched by desktop or Android smoke automation
- **THEN** the app SHALL expose the selected transport mode through stable UI text or identifiers
- **AND** the smoke assertion SHALL verify that the visible transport mode matches the configured fixture encoding

## ADDED Requirements

### Requirement: Public fixture backend contract gate
The public fixture E2E suite SHALL include a host-side backend contract gate that can run before device smoke tests.

#### Scenario: Backend contract runs without device tooling
- **WHEN** maintainers run the backend contract command
- **THEN** it SHALL validate the running fixture backend over HTTP in JSON and protobuf modes
- **AND** it SHALL not require Tauri desktop, tauri-driver, adb, or Maestro

#### Scenario: Smoke tests depend on the same backend behavior
- **WHEN** desktop or Android smoke tests use the fixture backend
- **THEN** they SHALL rely on the same reset, state, status, pull, push, encoding, and SQLite persistence behavior covered by backend contract tests
