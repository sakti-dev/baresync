## 1. Plugin Command Registration

- [x] 1.1 Add plugin-owned registration for DB, migration, sync, and polling commands in `tauri-plugin-baresync`.
- [x] 1.2 Preserve host-callable command logic and direct command tests without requiring a Tauri app or WebView.
- [x] 1.3 Add or update Rust tests proving registered plugin commands use the same state-backed behavior as existing command functions.

## 2. Builder Contract Metadata

- [x] 2.1 Decide whether the public builder input consumes generated manifest JSON, full contract JSON, or both.
- [x] 2.2 Implement generated metadata parsing into `SyncContractTables`.
- [x] 2.3 Add builder validation errors for missing table order or local-only column metadata.
- [x] 2.4 Keep explicit `contract_tables(...)` support and add tests proving it still works.

## 3. Builder Database Path Helper

- [x] 3.1 Add `db_name(...)` builder support that resolves under the Tauri app data directory during setup.
- [x] 3.2 Create parent directories before connecting when `db_name(...)` is used.
- [x] 3.3 Preserve `db_path(...)` precedence and add tests for explicit path behavior.

## 4. JavaScript Command Defaults

- [x] 4.1 Update `createTauriDrizzleDatabase` default DB proxy commands to `plugin:baresync|run_sql` and `plugin:baresync|run_sql_batch`.
- [x] 4.2 Update `createSyncClient` default sync and polling command names to the Baresync plugin command namespace.
- [x] 4.3 Preserve custom invoke and command-name overrides for legacy app-local command wrappers.
- [x] 4.4 Update JS tests for default plugin command names and override behavior.

## 5. Fixture And Documentation

- [x] 5.1 Migrate `tests/fixture-app` to compact plugin registration without app-local Baresync command wrappers.
- [x] 5.2 Update Tauri plugin and getting-started docs to show builder-only setup with generated contract metadata.
- [x] 5.3 Document legacy command-name overrides for consumers that still use app-local wrappers.

## 6. Verification

- [x] 6.1 Run `bun x ultracite check`.
- [x] 6.2 Run the root typecheck script.
- [x] 6.3 Run affected JS tests for DB proxy and sync client command behavior.
- [x] 6.4 Run affected Rust tests for `tauri-plugin-baresync`.
- [x] 6.5 Re-run `openspec status --change simplify-tauri-plugin-registration` and confirm the change is apply-ready.
