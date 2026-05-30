# Optional Device Smoke Tests

The host command and JS invoke simulation tests are the normal Phase 14 verification path.

Desktop and Android smoke files in this package are opt-in. They are not required by `cargo test --workspace`, `bun test`, or `bun x ultracite check`.

The public fixture app lives under `tests/fixture-app` and is the only supported target for these smoke flows. `openspec/external/sakti-pos` is not part of public fixture E2E.

## Fixture Backend

The smoke app uses a deterministic local backend that serves fixed pull data and records pushed rows for assertions.

Start it in a separate terminal:

```sh
bun --cwd tests/e2e run fixture:backend
```

Use `fixture:backend:json` when you want to pin the backend transport mode explicitly.
Use `fixture:backend:contract` or `fixture:backend:contract:json` to run the HTTP contract checks against the real backend and its SQLite state.

Useful env vars:

- `BARESYNC_FIXTURE_API_URL`: fixture app sync URL, default `http://127.0.0.1:18080`
- `BARESYNC_FIXTURE_SCOPE_ID`: sync scope to use, default `merchant-1`
- `BARESYNC_FIXTURE_ENCODING`: sync transport mode, default `json`
- `BARESYNC_FIXTURE_RUN_ID`: run identifier used to derive a stable local DB path
- `BARESYNC_FIXTURE_BACKEND_PORT`: backend listen port, default `18080`
- `BARESYNC_FIXTURE_DB_PATH`: backend SQLite path, default `/tmp/baresync-fixture-${BARESYNC_FIXTURE_RUN_ID}.db`, or `:memory:` for contract tests

## Desktop

Prerequisites:

- The public fixture Tauri desktop app
- `tauri-driver`
- WebDriverIO tooling in the consumer app workspace

Example command:

```sh
BARESYNC_DESKTOP_APP_PATH=/path/to/fixture-app \
BARESYNC_FIXTURE_API_URL=http://127.0.0.1:18080 \
bun --cwd tests/e2e run desktop:sync
```

The smoke harness also exposes `desktop:sync:json` for explicit transport runs.

The desktop smoke should validate plugin registration, command names, WebView-to-Rust IPC, local SQLite file behavior, baseline pull, local create, manual sync, and restart persistence.
When a desktop smoke fails, collect:

- the selected transport mode from the runner environment
- the app-visible transport mode from the UI, if exposed
- the backend transport mode from fixture logs or `/__state`
- `GET /__state` from the fixture backend to confirm whether the push path recorded the local rows
- the generator drift check output if the generated artifacts might be stale

The backend contract checks should be used first when validating backend request/response behavior or SQLite persistence without launching the desktop app.

## Android

Prerequisites:

- The public fixture Android app build
- Maestro
- A connected emulator or device

Example command:

```sh
BARESYNC_ANDROID_APP_ID=com.example.app \
BARESYNC_ANDROID_READY_TEXT=Baresync \
bun --cwd tests/e2e run android:sync
```

The Android smoke harness also exposes `android:sync:json` for explicit transport runs.

`android:sync` now performs an adb preflight and refuses to run if no usable device is attached or if the fixture package is not installed on the selected target.

Android backend rules:

- Emulator builds should use the fixture backend URL that maps to the host, typically `http://10.0.2.2:18080`.
- Physical-device builds must use a LAN-reachable backend URL and should be built with `BARESYNC_FIXTURE_API_URL` set before packaging the app.
- The public fixture app resolves the backend URL from Rust at startup, so the installed Android build must match the target it was built for.

The Android smoke is final lifecycle and filesystem confidence only. Sync correctness belongs in the host command, JS invoke, and host-only simulation suites.
When Android smoke fails, collect:

- the selected transport mode from the runner environment
- the app-visible transport mode from the UI, if exposed
- the backend transport mode from fixture logs or `/__state`
- logcat output
- the fixture backend `/__state` response or a SQLite snapshot for the local app data
- the generator drift check output if the generated artifacts might be stale

Use the backend contract checks to verify the deterministic fixture backend before treating an Android failure as a device-only issue.
