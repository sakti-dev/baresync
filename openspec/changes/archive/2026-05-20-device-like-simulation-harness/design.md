## Context

Phase 13 proved the sync protocol and local engine behavior with host-only JS and Rust simulation tests. Phase 14 needs coverage closer to the Tauri boundary: command handlers, JS `invoke` calls, and smoke-test scaffolding that can later run against desktop or Android without becoming mandatory for normal CI.

The current repo does not contain the Sakti app `apps/` tree, so this change focuses on the reusable `baresync` package and plugin. Consumer-app migration remains downstream work.

## Goals / Non-Goals

**Goals:**

- Add TDD-first host tests for plugin command behavior using constructed test state.
- Keep JS client simulation deterministic through injected `invoke` functions.
- Add desktop and Android smoke skeletons that are opt-in and documented.
- Keep normal verification runnable on a developer machine without Android, adb, Tauri WebView, or a desktop driver.

**Non-Goals:**

- Do not implement protobuf protocol support in this change.
- Do not migrate the Sakti POS app to the public package surface.
- Do not require desktop or Android smoke tests in the default CI path.
- Do not add app-specific auth, asset sync, or UI status behavior to the reusable package.

## Decisions

1. Plugin command tests will run at the command-handler layer.

   The tests should construct the same state shape used by the plugin and call command logic without starting a full Tauri application. This gives coverage for DB proxy, migration, sync state, outbox purge, and garbage collection commands while keeping the tests stable in CI.

2. JS client tests will stay invoke-injection based.

   The client already supports a custom `invoke` function, which is the right seam for device-like simulation in JS. New tests should verify command names, argument shape, return propagation, and failure propagation rather than requiring Tauri IPC.

3. Desktop and Android coverage will be skeleton-only and opt-in.

   Phase 14 should create the test entry points and documentation, but normal verification must not depend on `tauri-driver`, Maestro, adb, a WebView, or a connected device.

4. TDD is required for implementation.

   Each behavior task starts by adding or extending a focused failing test, running the targeted command to observe the expected failure, then implementing the minimum code needed to pass.

## Risks / Trade-offs

- Host command tests may drift from real Tauri invocation if they bypass too much framework behavior. Mitigation: test command logic with the same request/response payloads and keep optional smoke tests for lifecycle confidence.
- Smoke skeletons can become stale if they are never run. Mitigation: document prerequisites and keep them small enough to run manually when release infrastructure is ready.
- Adding too much Phase 14 scope could reopen app migration. Mitigation: keep this change inside `crates/tauri-plugin-baresync`, `packages/baresync`, `e2e`, and docs.
