## Why

The host-only simulation harness covers sync protocol behavior, but it does not prove the Tauri plugin command surface and JS client invocation layer behave like a real app boundary. Phase 14 adds device-like coverage without requiring Android, adb, a WebView, or a running desktop app in normal CI.

## What Changes

- Add host-runnable tests for the Tauri plugin command handlers using test state.
- Expand JS Tauri client coverage with mocked `invoke` calls where needed.
- Add opt-in desktop and Android smoke test skeletons for lifecycle and filesystem confidence.
- Document how device-like simulation is split between normal CI and optional manual smoke runs.
- Keep protobuf protocol work deferred; this change validates the current JSON-first implementation surface.

## Capabilities

### New Capabilities

- `device-like-simulation`: Covers plugin command simulation, JS client invocation simulation, and opt-in desktop/Android smoke scaffolding.

### Modified Capabilities

- `js-sync-client`: Requires the JS client to remain testable through injected/mocked Tauri invocation and to expose command behavior suitable for device-like simulation.
- `tauri-plugin-builder`: Requires plugin commands to be callable from host tests with constructed test state, without starting a full Tauri app or WebView.

## Impact

- Affected Rust tests: `crates/tauri-plugin-baresync/tests/commands.rs`.
- Affected JS tests: `packages/baresync/src/tauri/__test__/client.test.ts`.
- New opt-in smoke files under `packages/e2e/desktop/` and `packages/e2e/android/`.
- New documentation under `openspec/knowledge/`.
- No production protocol changes and no protobuf implementation work in this change.
