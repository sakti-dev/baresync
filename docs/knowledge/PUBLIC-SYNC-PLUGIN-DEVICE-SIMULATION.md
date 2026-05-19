# Public Sync Plugin Device Simulation

Phase 14 splits device-like confidence into host simulation and optional smoke tests.

## Normal Verification

Run these on a normal development machine and in CI:

```sh
cargo test -p tauri-plugin-baresync --test commands
bun test packages/baresync/src/tauri/__test__/client.test.ts
```

The Rust command tests construct plugin state with a temporary SQLite database, embedded migrations, sync config, contract tables, and DB path. They call host-testable command logic without Android, adb, a WebView, a desktop driver, or network access.

The JS client tests inject a mocked `invoke` function. They verify command names, argument shape, resolved result propagation, and rejected error propagation without a Tauri runtime.

## Optional Desktop Smoke

Desktop smoke testing is opt-in and lives under `packages/e2e/desktop`.

Use it after host verification passes and a consumer Tauri desktop app exists.

Prerequisites:

- A built local Tauri desktop app that consumes `tauri-plugin-baresync`
- `tauri-driver`
- WebDriverIO tooling in the consumer app workspace

Example:

```sh
BARESYNC_DESKTOP_APP_PATH=/path/to/app \
BARESYNC_DESKTOP_SMOKE_URL=http://127.0.0.1:1420 \
bun x wdio run packages/e2e/desktop/webdriverio.conf.ts
```

Desktop smoke should prove plugin registration, command names, WebView-to-Rust IPC, and SQLite file behavior. It is not the primary sync correctness suite.

## Optional Android Smoke

Android smoke testing is opt-in and lives under `packages/e2e/android`.

Use it only for final lifecycle and filesystem confidence after host and desktop checks.

Prerequisites:

- A prepared Android build that consumes `tauri-plugin-baresync`
- Maestro
- A connected emulator or physical device

Example:

```sh
BARESYNC_ANDROID_APP_ID=com.example.app \
BARESYNC_ANDROID_READY_TEXT=Baresync \
maestro test packages/e2e/android/sync-smoke.yaml
```

Android smoke should stay small. It should not replace deterministic Rust and JS simulation coverage.
