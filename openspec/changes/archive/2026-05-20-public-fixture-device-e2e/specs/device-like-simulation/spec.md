## MODIFIED Requirements

### Requirement: Opt-in smoke scaffolding
The system SHALL provide desktop and Android smoke test entry points that drive the public Baresync fixture app and remain excluded from normal verification by default.

#### Scenario: Desktop smoke automation
- **WHEN** a developer runs the desktop smoke command with the required local tooling and fixture app build
- **THEN** the smoke flow SHALL launch the public fixture app through Tauri desktop infrastructure and validate plugin registration, Tauri IPC, embedded migrations, Drizzle proxy reads, local SQLite persistence, baseline pull, local create, push, and restart behavior

#### Scenario: Android smoke automation
- **WHEN** a developer runs the Android smoke command with Maestro and a prepared fixture app/device
- **THEN** the smoke flow SHALL launch the public fixture app and validate Android lifecycle and filesystem confidence for SQLite initialization, baseline pull, local persistence, manual sync, and clean app-data reset behavior
