## 1. Plugin Command Host Tests

- [x] 1.1 Add `crates/tauri-plugin-baresync/tests/commands.rs` with a test-state builder using a temporary SQLite database, test sync config, contract tables, DB path, and embedded migrations
- [x] 1.2 Write a failing test for DB proxy command behavior covering `run_sql`, `run_sql_batch`, and `get_db_info`; run `cargo test -p tauri-plugin-baresync --test commands` and confirm the expected failure
- [x] 1.3 Implement the minimum command-test support needed for the DB proxy command test to pass
- [x] 1.4 Write a failing test for migration command behavior covering `run_migrations` and `get_migration_status`; run the targeted cargo test and confirm the expected failure
- [x] 1.5 Implement the minimum command-test support needed for the migration command test to pass
- [x] 1.6 Write a failing test for sync local state command behavior covering seeded outbox/cursor state and `get_sync_local_state`; run the targeted cargo test and confirm the expected failure
- [x] 1.7 Implement the minimum command-test support needed for the local state command test to pass
- [x] 1.8 Write failing tests for maintenance command behavior covering `purge_synced_outbox` and `run_garbage_collection`; run the targeted cargo test and confirm the expected failure
- [x] 1.9 Implement the minimum command-test support needed for the maintenance command tests to pass

## 2. JS Client Device-Like Simulation

- [x] 2.1 Add a failing JS client test proving resolved mocked `invoke` results are returned by `syncNow`, `push`, `pull`, `fullResync`, and `getState`; run `bun test packages/baresync/src/tauri/__test__/client.test.ts` and confirm the expected failure
- [x] 2.2 Implement the minimum JS client behavior needed for mocked result propagation to pass
- [x] 2.3 Add a failing JS client test proving rejected mocked `invoke` errors propagate unchanged; run the targeted bun test and confirm the expected failure
- [x] 2.4 Implement the minimum JS client behavior needed for error propagation to pass
- [x] 2.5 Add or extend JS client tests for command argument shape across all sync methods; run the targeted bun test and confirm the expected result

## 3. Opt-In Smoke Skeletons

- [x] 3.1 Add `packages/e2e/desktop/sync-smoke.test.ts` as an opt-in desktop sync smoke skeleton
- [x] 3.2 Add `packages/e2e/desktop/webdriverio.conf.ts` with local-only desktop smoke configuration
- [x] 3.3 Add `packages/e2e/android/sync-smoke.yaml` as an opt-in Maestro Android smoke skeleton
- [x] 3.4 Add `packages/e2e/README.md` documenting prerequisites and commands for optional desktop and Android smoke runs

## 4. Device Simulation Documentation

- [x] 4.1 Add `docs/knowledge/PUBLIC-SYNC-PLUGIN-DEVICE-SIMULATION.md` documenting host CI scope, optional smoke scope, prerequisites, and expected use
- [x] 4.2 Update `docs/MILESTONES.md` to mark Phase 14 complete only after command tests, JS tests, smoke skeletons, and documentation pass review

## 5. Verification

- [x] 5.1 Run `cargo test -p tauri-plugin-baresync --test commands`
- [x] 5.2 Run `bun test packages/baresync/src/tauri/__test__/client.test.ts`
- [x] 5.3 Run `cargo test --workspace`
- [x] 5.4 Run `bun test`
- [x] 5.5 Run `bun x ultracite check`
