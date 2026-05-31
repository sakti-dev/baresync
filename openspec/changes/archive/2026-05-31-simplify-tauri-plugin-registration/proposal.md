## Why

Consumer Tauri apps currently have to copy a long list of `#[command]` wrapper functions and manually duplicate generated table-order metadata in Rust. That makes Baresync setup noisy, easy to drift from generated sync artifacts, and awkward for a future `create-baresync` scaffolder.

## What Changes

- Move Baresync command registration into `tauri-plugin-baresync` so app code does not need to define local wrappers for `run_sql`, sync commands, migration commands, or polling commands.
- Add a builder API that loads contract table metadata from generated contract artifacts instead of requiring app-authored `SyncContractTables` values.
- Add a builder API for app-data database names while preserving explicit `db_path(...)` for tests and advanced deployments.
- Update JS database and sync clients to use plugin command names by default while keeping custom command names and injected `invoke` functions for compatibility and tests.
- Update fixture app and docs to demonstrate compact builder registration with explicit Rust builder configuration.
- Do not add `tauri.conf.json` default loading; plugin setup remains code-first through the builder.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `tauri-plugin-builder`: plugin-owned command registration, generated contract metadata loading, and app-data DB name builder behavior.
- `js-sync-client`: default command names change to the registered plugin command namespace while preserving custom invocation support.
- `local-database`: Drizzle proxy helper defaults change to the registered plugin command namespace while preserving custom command mapping.

## Impact

Affected code includes `crates/tauri-plugin-baresync`, plugin builder tests, command tests, `tests/fixture-app`, `packages/baresync/src/tauri`, `packages/baresync/src/db`, JS tests, and Tauri plugin/getting-started documentation. The public setup surface becomes smaller, while existing direct command names remain available through compatibility configuration where practical.
