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

#### Scenario: Restart persistence

- **WHEN** automation creates local fixture data and restarts the app
- **THEN** the fixture app SHALL display the same persisted local data from SQLite after restart

### Requirement: Public sync smoke scenarios

The system SHALL provide opt-in smoke scenarios that prove public Baresync integration across real Tauri boundaries.

#### Scenario: Baseline pull

- **WHEN** the fixture app starts from a clean local database and automation triggers sync
- **THEN** server fixture rows SHALL be pulled into local SQLite and rendered by the fixture app

#### Scenario: Local create and push

- **WHEN** automation creates a local fixture row while using the fixture app
- **THEN** the row SHALL persist locally, survive app restart, and push through the public sync client into the deterministic test backend

#### Scenario: DB proxy and migration visibility

- **WHEN** automation runs the fixture smoke flow
- **THEN** the flow SHALL prove that embedded migrations completed and Drizzle proxy reads can query the local SQLite data through plugin commands

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
- **THEN** the E2E implementation SHALL NOT require `docs/external/sakti-pos`, Sakti app routes, Sakti auth, Sakti schema, or Sakti-specific commands
