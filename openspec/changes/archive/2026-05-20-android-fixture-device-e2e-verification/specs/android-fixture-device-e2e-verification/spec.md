## ADDED Requirements

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
- **THEN** the deterministic fixture backend SHALL record the pushed category and product and the Android UI SHALL show those rows as clean or synced

#### Scenario: Android restart persistence
- **WHEN** automation restarts or relaunches the Android fixture app after manual sync
- **THEN** the created category, created product, clean sync state, and satisfied baseline state SHALL still be visible from persisted SQLite state

#### Scenario: Android app data reset
- **WHEN** automation clears app data or reinstalls the fixture app between Android smoke runs
- **THEN** the next run SHALL start from a clean local SQLite state and repeat the baseline pull without relying on previous run state

### Requirement: Android failure evidence
The Android fixture smoke SHALL provide enough public, synthetic failure evidence to diagnose fixture integration failures without requiring private app data.

#### Scenario: Android failure artifacts are collected
- **WHEN** the Android smoke flow fails
- **THEN** the runner SHALL collect or document how to collect Maestro output, adb logcat, fixture backend state, app id, device id, backend URL, reset method, and generated fixture build metadata

#### Scenario: Failure artifacts remain public-safe
- **WHEN** Android fixture artifacts are collected
- **THEN** they SHALL contain only synthetic fixture data or redacted operational metadata and SHALL NOT require `docs/external/sakti-pos` or any private consumer app data
