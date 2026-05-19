# Optional Device Smoke Tests

The host command and JS invoke simulation tests are the normal Phase 14 verification path.

Desktop and Android smoke files in this package are opt-in. They are not required by `cargo test --workspace`, `bun test`, or `bun x ultracite check`.

The public fixture app lives under `apps/baresync-fixture` and is the only supported target for these smoke flows. `docs/external/sakti-pos` is not part of public fixture E2E.

## Fixture Backend

The smoke app uses a deterministic local backend that serves fixed pull data and records pushed rows for assertions.

Start it in a separate terminal:

```sh
bun --cwd packages/e2e run fixture:backend
```

Useful env vars:

- `BARESYNC_FIXTURE_API_URL`: fixture app sync URL, default `http://127.0.0.1:18080`
- `BARESYNC_FIXTURE_SCOPE_ID`: sync scope to use, default `merchant-1`
- `BARESYNC_FIXTURE_RUN_ID`: run identifier used to derive a stable local DB path
- `BARESYNC_FIXTURE_BACKEND_PORT`: backend listen port, default `18080`

## Desktop

Prerequisites:

- The public fixture Tauri desktop app
- `tauri-driver`
- WebDriverIO tooling in the consumer app workspace

Example command:

```sh
BARESYNC_DESKTOP_APP_PATH=/path/to/fixture-app \
BARESYNC_FIXTURE_API_URL=http://127.0.0.1:18080 \
bun --cwd packages/e2e run desktop:sync
```

The desktop smoke should validate plugin registration, command names, WebView-to-Rust IPC, local SQLite file behavior, baseline pull, local create, manual sync, and restart persistence.
When a desktop smoke fails, collect the app logs and inspect `GET /__state` from the fixture backend to confirm whether the push path recorded the local rows.

## Android

Prerequisites:

- The public fixture Android app build
- Maestro
- A connected emulator or device

Example command:

```sh
BARESYNC_ANDROID_APP_ID=com.example.app \
BARESYNC_ANDROID_READY_TEXT=Baresync \
bun --cwd packages/e2e run android:sync
```

The Android smoke is final lifecycle and filesystem confidence only. Sync correctness belongs in the host command, JS invoke, and host-only simulation suites.
When Android smoke fails, collect logcat output and, when practical, capture the fixture backend `/__state` response or a SQLite snapshot for the local app data.
