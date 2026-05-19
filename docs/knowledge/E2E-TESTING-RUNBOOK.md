# E2E Testing Runbook

This document captures the practical details needed to extend Baresync E2E testing without rediscovering the same setup and failure modes.

The short version: keep sync correctness in deterministic host tests, keep device tests tiny, and make every smoke run own its backend, app server, database namespace, and reset path.

## Current E2E Layers

Baresync has three useful verification layers. Do not collapse them into one UI test.

1. Host Rust tests
   - Purpose: sync algorithm, SQLite behavior, migrations, outbox coalescing, push/pull ordering, conflict handling, garbage collection, and Tauri command logic that can run without a real Tauri app.
   - Command: `cargo test --workspace`
   - Typical files: `crates/baresync-core/tests/simulation.rs`, `crates/tauri-plugin-baresync/tests/commands.rs`

2. JS/API tests and typechecks
   - Purpose: public JS API shape, mocked `invoke` behavior, package types, and app-consumer compile safety.
   - Commands: `bun test`, `bun run typecheck`, `bun x ultracite check`
   - Typical files: `packages/baresync/src/**`, `packages/e2e/**`

3. Opt-in device smoke tests
   - Purpose: real runtime wiring only: app launch, Tauri plugin registration, WebView-to-Rust IPC, embedded migrations, SQLite file persistence, baseline pull, local create, manual push, restart/app-data lifecycle.
   - Desktop command: `bun --cwd packages/e2e run desktop:sync`
   - Android command: `bun --cwd packages/e2e run android:sync`
   - Device smoke tests are not the place for protocol edge cases.

## Fixture App Contract

The public fixture app is the only supported E2E target in this repo.

- App path: `apps/baresync-fixture`
- Tauri app path: `apps/baresync-fixture/src-tauri`
- Backend path: `packages/e2e/backend/fixture-server.ts`
- Desktop smoke: `packages/e2e/desktop/sync-smoke.test.ts`
- Android smoke: `packages/e2e/android/sync-smoke.yaml`

Do not wire `docs/external/sakti-pos` into public E2E. Private downstream apps should copy the fixture integration pattern and keep their own E2E outside this public repo.

The fixture app must use the public surfaces that a real consumer uses:

- `tauri-plugin-baresync` registration in Rust
- embedded migrations
- `createSyncClient`
- `createTauriDrizzleDatabase`
- Tauri `invoke` from the frontend
- SQLite-backed local persistence

Avoid fixture-only shortcuts around plugin registration, migrations, or IPC. A fixture app that bypasses these surfaces gives false confidence.

## Deterministic Backend

Every E2E run needs a deterministic backend with three capabilities:

- Baseline pull returns fixed rows with stable IDs and timestamps.
- Push records rows sent by the app so the test can assert backend state.
- Reset clears backend state before each run.

The current backend exposes:

- `POST /__reset`
- `GET /__state`
- `GET /sync/pull?scopeId=merchant-1`
- `POST /sync/push`

Important rule: the desktop runner should start and own the backend. Do not rely on a developer already having something on `localhost:18080`. That leads to stale state, port conflicts, and false passes.

The desktop WDIO config should:

- allocate a free backend port
- set `BARESYNC_FIXTURE_BACKEND_PORT`
- set `BARESYNC_FIXTURE_API_URL`
- start `bun run backend/fixture-server.ts`
- wait for `GET /__state` before launching the app
- kill the backend on completion

## Run Isolation

Each smoke run should be isolated from previous runs.

Use `BARESYNC_FIXTURE_RUN_ID` to derive the local DB path:

```sh
/tmp/baresync-fixture-${BARESYNC_FIXTURE_RUN_ID}.db
```

The desktop runner should set a unique run ID by default, for example `desktop-${Date.now()}`.

Why this matters:

- stale `sync_outbox` rows can hide broken local create behavior
- stale `sync_cursors` can skip baseline paths
- stale local rows can make restart assertions pass without the current run creating anything
- repeated local IDs like `local-cat-001` collide unless the DB is reset or namespaced

Use backend reset and a fresh DB namespace together. One without the other is not enough.

## Desktop Smoke Setup

Desktop smoke has three moving parts:

- fixture backend
- Vite dev server for the fixture frontend
- `tauri-driver` controlling the built Tauri binary

The WDIO config should start the fixture backend and Vite dev server in `onPrepare`, build the Tauri app, start `tauri-driver` in `beforeSession`, and clean up all spawned processes on completion.

Typical command:

```sh
nix develop .#default --command bash -lc '
  cd packages/e2e
  BARESYNC_DESKTOP_APP_PATH=/home/eekrain/CODE/baresync/target/debug/baresync-fixture \
    bun run desktop:sync
'
```

The smoke should assert all of these:

- app status reaches `ready`
- DB path contains the fixture run ID
- migration count is expected
- baseline sync runs and renders server rows
- local row creation renders local category/product rows
- manual sync result includes `tables_synced` for expected tables
- backend `/__state` includes pushed local row IDs
- accepted local rows become clean, for example `is_synced: 1`
- app restart preserves local rows and clean state
- baseline is satisfied after restart

Do not only assert that text exists after a click. Web UI and Tauri IPC are asynchronous. Wait for semantic state, such as `#sync-result` containing `manual:` or a local row matching `"is_synced":1`.

## Android Smoke Setup

Android smoke is opt-in final lifecycle confidence. It should stay much smaller than host tests.

Prerequisites:

- default Nix dev shell
- built fixture Android app installed on a device/emulator, or a workflow that installs it before Maestro runs
- connected emulator or physical device visible to `adb devices`
- `BARESYNC_ANDROID_APP_ID`
- `BARESYNC_ANDROID_READY_TEXT`

Maestro is provided by the default Nix dev shell:

```sh
nix develop .#default --command bash -lc 'maestro --version'
```

Run:

```sh
nix develop .#default --command bash -lc '
  cd packages/e2e
  BARESYNC_ANDROID_APP_ID=com.example.app \
  BARESYNC_ANDROID_READY_TEXT=Baresync \
    bun run android:sync
'
```

Android smoke should prove:

- fresh app launch reaches readiness
- SQLite and migrations initialize on Android
- baseline pull renders visible fixture state
- local create renders visible state
- manual sync completes
- app data reset or reinstall produces a fresh baseline

Android smoke should not test idempotency, conflict resolution, adaptive chunking, or detailed protocol semantics. Those belong in host tests.

## Flake And Tooling

Use `nix develop .#default` for E2E work. The shell should provide:

- Rust toolchain
- Bun/Node runtime
- Android SDK/NDK/JDK
- `adb`
- `maestro`
- Tauri host libraries
- SQLite CLI

Important Tauri host libraries include `dbus`, GTK/WebKit libraries, `libsoup_3`, and related dependencies. Missing host libraries often show up as the app opening briefly and then failing before the WebView is useful.

The shell exports Maestro env vars to keep automation output stable:

```sh
MAESTRO_CLI_NO_ANALYTICS=true
MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
```

Verify flake changes with:

```sh
nix flake check
nix develop .#default --command bash -lc 'command -v maestro && maestro --version'
```

## Tauri Command Registration

The fixture app needs plain frontend `invoke("command_name")` calls to resolve. There are two common patterns:

- plugin-provided command registration
- app-level wrapper commands that delegate to plugin command helpers

Be explicit about which pattern is used. If the app registers wrapper commands, the frontend should call plain command names such as:

- `run_migrations`
- `run_sql`
- `run_sql_batch`
- `get_db_info`
- `get_migration_status`
- `sync_now`
- `get_sync_local_state`

Do not mix namespaced plugin calls like `plugin:baresync|run_sql` with plain app-level wrappers unless you have verified both registration paths. A mismatch produces confusing runtime failures that look like app startup or localhost problems.

## Drizzle Proxy And Invoke

`createTauriDrizzleDatabase` should receive an explicit `invoke` function in fixture and consumer apps. Avoid dynamic imports of `@tauri-apps/api/core` from shared package code if that package can be bundled by Vite in non-Tauri contexts. Dynamic Tauri imports can make fixture builds fail before the app reaches sync logic.

Good fixture pattern:

```ts
export const fixtureDb = createTauriDrizzleDatabase({
  schema,
  invoke: invoke as unknown as InvokeFn,
});
```

If `invoke` is missing, fail with a clear error instead of silently trying a runtime import that may not bundle.

## Outbox And Clean State

For local changes to push, the local DB must contain pending outbox rows:

```sql
SELECT COUNT(*)
FROM sync_outbox
WHERE synced_at IS NULL
  AND scope_id = ?;
```

If `local_dirty_count` is `0` after a local create, the push engine has nothing to send. Check:

- the app wrote to the same SQLite DB that the plugin state uses
- `sync_outbox.scope_id` matches the sync client scope
- `sync_outbox.synced_at` is `NULL`
- `sync_outbox.table_name` matches the contract table name exactly
- `sync_outbox.row_id` matches the local row primary key
- the row exists in the source table for insert/update operations

After the server accepts a push, the engine should:

- mark accepted outbox rows with `synced_at`
- mark accepted source rows as clean, for example `is_synced = 1`
- return `rejected_tables: []` when the backend returned no rejected IDs

Watch transaction order carefully. If source rows are marked clean before accepted outbox rows are cleared, guards that check for pending outbox entries can keep rows dirty even after a successful push.

Smoke tests should assert both backend acceptance and local clean state. Backend acceptance alone is not enough.

## Async UI Test Rules

Most desktop smoke failures are not sync algorithm failures; they are bad waits.

Use these patterns:

- Wait for `#app-status` to equal `ready`, not merely for the element to exist.
- After clicking baseline sync, wait for `#sync-result` to include `baseline:`.
- After clicking manual sync, wait for `#sync-result` to include `manual:`.
- After manual sync, wait for the local row to show clean state.
- After restart, wait for readiness again before reading persisted state.

Avoid these patterns:

- reading status immediately after `click()`
- assuming `waitForDisplayed()` means app bootstrap is complete
- using fixed sleeps as the primary synchronization mechanism
- asserting only broad substrings that can match stale server rows

Use top-level regex constants in test files because Ultracite flags regex literals inside functions.

## Common Failure Modes

### App shows "could not connect to localhost"

Likely causes:

- Vite dev server was not started
- Tauri config points to a dev URL that is not listening
- the runner started the app before Vite was ready

Fix:

- start `bun run dev --host 127.0.0.1 --port 5173` in the WDIO `onPrepare`
- keep stdout/stderr attached so Vite failures are visible
- wait for the server before expecting app readiness if needed

### Backend fetch fails in the test `before` hook

Likely causes:

- fixture backend was not started
- hard-coded port conflicted
- stale process from a previous run owns the port

Fix:

- let the runner allocate a free port
- export `BARESYNC_FIXTURE_API_URL`
- start backend in `onPrepare`
- wait for `/__state`

### App opens briefly then crashes or never reaches `ready`

Likely causes:

- missing Tauri host library, such as `dbus`
- WebKit runtime failure
- command registration mismatch
- frontend bundle failed to resolve Tauri imports
- backend URL is wrong and bootstrap code does not handle it well

Fix:

- run inside `nix develop .#default`
- check app stderr
- verify command names called by frontend match registered Tauri commands
- verify `BARESYNC_FIXTURE_API_URL`

### Manual sync returns `tables_synced: []`

Likely causes:

- no pending outbox rows
- outbox rows have wrong scope/table/row IDs
- local row was written to a different DB
- local create path bypassed dirty tracking

Debug:

```sh
sqlite3 /tmp/baresync-fixture-<run-id>.db '
  SELECT id, table_name, row_id, scope_id, synced_at FROM sync_outbox;
  SELECT id, is_synced FROM categories;
  SELECT id, is_synced FROM products;
'
```

### Backend does not record pushed rows

Likely causes:

- manual sync never sent push payload
- backend URL points to a stale or different backend
- backend reset happened after push
- test fetched `/__state` from a different port than the app used

Fix:

- make the runner own `BARESYNC_FIXTURE_API_URL`
- assert the manual sync result before checking `/__state`
- log or inspect backend state from the same URL exported to the app

### `rejected_tables` is non-empty when backend rejected nothing

Likely cause:

- parser created entries for empty `rejected: []` arrays

Expected behavior:

- only tables with at least one rejected row ID should appear in `rejected_tables`
- empty rejected arrays should not trigger reconciliation pull

### Local row stays `is_synced: 0` after successful push

Likely cause:

- source row clean marking ran before accepted outbox rows were marked synced
- clean marking query intentionally avoids rows with pending outbox entries

Expected behavior:

- accepted outbox entries are cleared first
- accepted source rows are then marked clean
- smoke asserts the local row shows `is_synced: 1`

### WebKit reports internal error / invalid session id

This can happen as a desktop runner flake. Treat it separately from sync correctness.

Debug approach:

- rerun once to determine whether it is reproducible
- if reproducible, inspect app stderr and Tauri/WebKit startup logs
- avoid claiming verification passed from a failed run
- record the exact failure if it remains intermittent

## Debugging Sequence

When a smoke test fails, debug in this order:

1. Confirm the right processes are running.
   - backend
   - Vite dev server
   - `tauri-driver`
   - fixture app binary

2. Confirm environment propagation.
   - `BARESYNC_FIXTURE_API_URL`
   - `BARESYNC_FIXTURE_BACKEND_PORT`
   - `BARESYNC_FIXTURE_RUN_ID`
   - `BARESYNC_DESKTOP_APP_PATH`
   - Android app ID and ready text for Maestro

3. Confirm app readiness.
   - `#app-status`
   - migration count
   - DB path
   - sync result text

4. Confirm backend state.
   - `GET /__state`
   - pushed rows
   - expected scope ID

5. Confirm SQLite state.
   - source table rows
   - `sync_outbox`
   - `sync_cursors`
   - `is_synced`

6. Confirm core semantics with host tests.
   - add or run a Rust simulation test when behavior is engine-level
   - do not debug engine semantics only through WebDriver

## Verification Discipline

Before saying E2E work is done, run the checks that match the touched files.

For normal changes:

```sh
bun run typecheck
bun x ultracite check
cargo test --workspace
```

For Rust formatting-sensitive changes:

```sh
cargo fmt --check
```

For flake/tooling changes:

```sh
nix flake check
nix develop .#default --command bash -lc 'command -v maestro && maestro --version'
```

For desktop E2E changes:

```sh
nix develop .#default --command bash -lc '
  cd packages/e2e
  BARESYNC_DESKTOP_APP_PATH=/home/eekrain/CODE/baresync/target/debug/baresync-fixture \
    bun run desktop:sync
'
```

For Android E2E changes:

```sh
nix develop .#default --command bash -lc '
  cd packages/e2e
  BARESYNC_ANDROID_APP_ID=com.example.app \
  BARESYNC_ANDROID_READY_TEXT=Baresync \
    bun run android:sync
'
```

If Android cannot run because no device/emulator or app build is available, say that exactly. Do not mark it as a passing device run.

## What To Document In Future E2E Changes

Each E2E change should document:

- exact command used
- environment variables used
- whether backend and app server are self-managed by the runner
- whether DB path is unique per run
- whether app data is reset or preserved
- expected backend state after push
- expected local SQLite state after push
- known platform/tooling limitations
- artifacts to collect on failure

Future maintainers should be able to reproduce a failure from the docs without guessing which local services were running.
