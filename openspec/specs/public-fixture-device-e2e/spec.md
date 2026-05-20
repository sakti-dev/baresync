## Purpose

TBD

## Requirements

### Requirement: Public fixture consumer app

The system SHALL provide a repo-owned public Tauri fixture app that integrates Baresync through the same public surfaces expected of external consumers.

#### Scenario: Fixture uses public integration surfaces

- **WHEN** the fixture app is built
- **THEN** it SHALL register `tauri-plugin-baresync`, use the Baresync JS package, configure a sync client, use `createTauriDrizzleDatabase`, and run embedded migrations without depending on private Sakti POS source code

#### Scenario: Fixture exposes stable smoke controls

- **WHEN** desktop or Android automation launches the fixture app
- **THEN** the app SHALL expose stable user-visible controls or durable test identifiers for initializing sync, creating a local row, triggering sync, reading persisted rows, and displaying DB/sync status

### Requirement: Deterministic fixture state

The system SHALL isolate fixture E2E state so desktop and Android smoke runs are repeatable.

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

The system SHALL provide opt-in smoke scenarios that prove public Baresync integration across real Tauri boundaries.

#### Scenario: Baseline pull

- **WHEN** the fixture app starts from a clean local database and automation triggers sync
- **THEN** server fixture rows SHALL be pulled into local SQLite and rendered by the fixture app

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

### Requirement: Public fixture smoke transport matrix

The system SHALL execute the same public fixture smoke scenario against both JSON and protobuf transports and assert equivalent user-visible behavior.

#### Scenario: Desktop smoke passes in both transports

- **WHEN** the desktop smoke scenario runs in `json` mode and again in `protobuf` mode
- **THEN** baseline pull, local create, manual sync, backend state, and restart persistence SHALL all satisfy the same assertions

#### Scenario: Android smoke passes in both transports

- **WHEN** the Android smoke scenario runs in `json` mode and again in `protobuf` mode
- **THEN** baseline pull, local create, manual sync, backend state, and restart persistence SHALL all satisfy the same assertions

### Requirement: Failure artifacts

The system SHALL provide useful artifacts for diagnosing failed fixture device smoke runs.

#### Scenario: Desktop failure evidence

- **WHEN** the desktop smoke flow fails
- **THEN** the runner SHALL document or collect available logs and fixture state needed to diagnose plugin registration, IPC, migration, sync, or SQLite persistence failures

#### Scenario: Android failure evidence

- **WHEN** the Android smoke flow fails
- **THEN** the runner SHALL document or collect available logcat output and, when practical, a fixture DB snapshot or state dump without requiring private app data

### Requirement: Private app independence

The system SHALL keep public device E2E independent from private consumer applications.

#### Scenario: Sakti source is not required

- **WHEN** maintainers run or inspect the public fixture device E2E
- **THEN** the E2E implementation SHALL NOT require `openspec/external/sakti-pos`, Sakti app routes, Sakti auth, Sakti schema, or Sakti-specific commands

### Requirement: Public fixture backend contract gate
The public fixture E2E suite SHALL include a host-side backend contract gate that can run before device smoke tests.

#### Scenario: Backend contract runs without device tooling
- **WHEN** maintainers run the backend contract command
- **THEN** it SHALL validate the running fixture backend over HTTP in JSON and protobuf modes
- **AND** it SHALL not require Tauri desktop, tauri-driver, adb, or Maestro

#### Scenario: Smoke tests depend on the same backend behavior
- **WHEN** desktop or Android smoke tests use the fixture backend
- **THEN** they SHALL rely on the same reset, state, status, pull, push, encoding, and SQLite persistence behavior covered by backend contract tests

### Requirement: Verified Android smoke execution
The system SHALL only consider the public fixture Android smoke complete when it has been executed successfully against a connected adb device or emulator.

#### Scenario: Android smoke completion requires real device execution
- **WHEN** maintainers mark Android fixture E2E verification complete
- **THEN** they SHALL have run the Android smoke command against a connected adb target and recorded the command result in the change verification evidence

#### Scenario: Android scaffold is not treated as verified behavior
- **WHEN** Android automation exists but has not passed on a connected adb target
- **THEN** documentation and task status SHALL describe it as scaffolded or pending verification rather than working end-to-end behavior
