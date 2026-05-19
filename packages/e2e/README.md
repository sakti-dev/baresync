# Optional Device Smoke Tests

The host command and JS invoke simulation tests are the normal Phase 14 verification path.

Desktop and Android smoke files in this package are opt-in. They are not required by `cargo test --workspace`, `bun test`, or `bun x ultracite check`.

## Desktop

Prerequisites:

- A local Tauri desktop app that consumes `tauri-plugin-baresync`
- `tauri-driver`
- WebDriverIO tooling in the consumer app workspace

Example command:

```sh
BARESYNC_DESKTOP_APP_PATH=/path/to/app \
BARESYNC_DESKTOP_SMOKE_URL=http://127.0.0.1:1420 \
bun x wdio run packages/e2e/desktop/webdriverio.conf.ts
```

The desktop smoke should validate plugin registration, command names, WebView-to-Rust IPC, and local SQLite file behavior.

## Android

Prerequisites:

- A prepared Android app build that consumes `tauri-plugin-baresync`
- Maestro
- A connected emulator or device

Example command:

```sh
BARESYNC_ANDROID_APP_ID=com.example.app \
BARESYNC_ANDROID_READY_TEXT=Baresync \
maestro test packages/e2e/android/sync-smoke.yaml
```

The Android smoke is final lifecycle and filesystem confidence only. Sync correctness belongs in the host command, JS invoke, and host-only simulation suites.
