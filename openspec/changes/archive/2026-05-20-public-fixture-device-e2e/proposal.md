## Why

The current device-like coverage proves command handlers and mocked Tauri invocation on the host, but the opt-in desktop and Android smoke files are still skeletons. Baresync needs a public, repo-owned consumer app that proves the plugin, JS client, Drizzle proxy, migrations, and SQLite persistence integrate through real Tauri boundaries without depending on the private Sakti POS app.

## What Changes

- Add a minimal public Tauri fixture app dedicated to Baresync device E2E validation.
- Wire the fixture app through the public integration surface: `tauri-plugin-baresync`, `packages/baresync` JS APIs, `createSyncClient`, `createTauriDrizzleDatabase`, embedded migrations, and generated/declared sync contract metadata.
- Replace the desktop smoke skeleton with a real opt-in automation flow against the fixture app.
- Replace the Android smoke skeleton with a real opt-in Maestro flow against the fixture app.
- Add deterministic test data and state reset behavior for fresh install, baseline pull, local create, restart persistence, push, and clean app-data reset checks.
- Keep device E2E opt-in and focused on public integration boundaries; sync edge-case correctness remains in deterministic JS, Rust, fixture, plugin-command, and mocked-invoke suites.
- Do not depend on `docs/external/sakti-pos` or any private consumer app source in the public E2E implementation.

## Capabilities

### New Capabilities

- `public-fixture-device-e2e`: Covers the public fixture app, opt-in desktop and Android automation flows, deterministic device smoke scenarios, and failure artifact collection.

### Modified Capabilities

- `device-like-simulation`: Upgrades the existing opt-in desktop and Android smoke entry points from skeletons to real public fixture automation while keeping them excluded from normal CI by default.

## Impact

- New fixture app under a public repo-owned app/workspace path.
- Updates to `packages/e2e/desktop/`, `packages/e2e/android/`, and `packages/e2e/README.md`.
- Possible root workspace/package script updates for opt-in desktop and Android smoke commands.
- Possible fixture-specific generated sync artifacts, migrations, schema files, and test backend helpers.
- No Sakti POS app code is modified or required.
- No production protocol semantics change; this change validates public integration and device lifecycle behavior.
