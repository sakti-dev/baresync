## ADDED Requirements

### Requirement: Host-callable plugin command logic

The Tauri plugin command surface SHALL be testable from host Rust tests without launching a full Tauri app or WebView.

#### Scenario: Construct command test state

- **WHEN** a Rust test constructs plugin command state with a temporary SQLite database, sync config, contract tables, DB path, and embedded migrations
- **THEN** command logic SHALL be callable with that state and return command-compatible result values

#### Scenario: Exercise command behavior through host tests

- **WHEN** host tests call DB, migration, local state, outbox purge, and garbage collection command behavior
- **THEN** the tests SHALL exercise the same core functions used by the Tauri command handlers

#### Scenario: Avoid mandatory device dependencies

- **WHEN** `cargo test -p tauri-plugin-baresync --test commands` runs in normal development or CI
- **THEN** the tests SHALL pass without Android, adb, a WebView, desktop driver infrastructure, or network access
