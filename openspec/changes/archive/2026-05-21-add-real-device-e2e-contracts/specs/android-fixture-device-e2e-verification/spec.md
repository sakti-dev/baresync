## MODIFIED Requirements

### Requirement: Connected Android fixture smoke
The system SHALL provide an Android fixture smoke flow that can be executed against a connected adb device or emulator and verifies the public Baresync fixture app through real Android lifecycle boundaries.

#### Scenario: ADB target is available
- **WHEN** the Android smoke command starts
- **THEN** it SHALL verify that at least one adb device or emulator is connected and fail with an actionable message when no usable target exists

#### Scenario: Fixture app installs and launches
- **WHEN** the Android smoke command runs with a connected target
- **THEN** it SHALL build or install the public fixture Android app, launch the configured app id, and wait for fixture readiness through stable UI text or identifiers

#### Scenario: Android backend reachability
- **WHEN** the fixture app runs on Android
- **THEN** it SHALL use a backend URL reachable from that Android target, including emulator host mapping or a physical-device LAN address where appropriate
- **AND** the reachable backend SHALL be the deterministic SQLite-backed fixture backend used by the public fixture smoke suite

#### Scenario: Backend state is reset before Android smoke
- **WHEN** the Android smoke flow starts
- **THEN** the runner SHALL reset the fixture backend through `POST /__reset`
- **AND** it SHALL verify that `GET /__state` is reachable before launching or driving sync assertions

### Requirement: Android sync lifecycle validation
The Android fixture smoke SHALL validate the same public Baresync integration seams and business assertions as the desktop fixture smoke while accounting for Android install, reset, networking, and filesystem behavior.

#### Scenario: Android launch and runtime readiness
- **WHEN** automation starts from a clean Android app state and launches the fixture app
- **THEN** the app SHALL report ready status, expose a fixture SQLite DB path, report completed embedded migrations, and prove Drizzle proxy-backed local reads through the plugin

#### Scenario: Android baseline pull
- **WHEN** automation triggers baseline sync in the Android fixture app
- **THEN** deterministic backend rows SHALL be pulled into local SQLite, rendered in the Android UI, and leave baseline state satisfied for the current scope

#### Scenario: Android local create renders locally
- **WHEN** automation creates a local fixture category and product in the Android app
- **THEN** both rows SHALL render in the Android UI from local SQLite before manual sync

#### Scenario: Android manual sync push
- **WHEN** automation triggers manual sync after local row creation
- **THEN** the deterministic fixture backend SHALL record the pushed category and product in SQLite-backed state
- **AND** the Android UI SHALL show those rows as clean or synced

#### Scenario: Android restart persistence
- **WHEN** automation restarts or relaunches the Android fixture app after manual sync
- **THEN** the created category, created product, clean sync state, and satisfied baseline state SHALL still be visible from persisted SQLite state

#### Scenario: Android app data reset
- **WHEN** automation clears app data or reinstalls the fixture app between Android smoke runs
- **THEN** the next run SHALL start from a clean local SQLite state and repeat the baseline pull without relying on previous run state

### Requirement: Verified Android smoke execution
The system SHALL only consider the public fixture Android smoke complete when it has been executed successfully against a connected adb device or emulator with the deterministic fixture backend.

#### Scenario: Android smoke completion requires real device execution
- **WHEN** maintainers mark Android fixture E2E verification complete
- **THEN** they SHALL have run the Android smoke command against a connected adb target and recorded the command result in the change verification evidence
- **AND** the recorded evidence SHALL include the fixture transport mode, backend URL, app id, and adb target identity

#### Scenario: Android scaffold is not treated as verified behavior
- **WHEN** Android automation exists but has not passed on a connected adb target
- **THEN** documentation and task status SHALL describe it as scaffolded or pending verification rather than working end-to-end behavior

#### Scenario: Backend contract does not replace Android smoke
- **WHEN** fixture backend contract tests pass on the host
- **THEN** Android verification SHALL still require a connected-device smoke run before claiming Android lifecycle behavior is verified
