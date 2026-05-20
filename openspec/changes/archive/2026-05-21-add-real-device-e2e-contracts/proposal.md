## Why

The current fixture backend is mostly a deterministic harness, while the real-device confidence story depends on smoke tests that can be expensive or environment-dependent to run. We need explicit contracts that prove the fixture backend speaks the same HTTP protocol as the app and that desktop/Android smoke runs verify real Baresync behavior instead of only assuming the wiring works.

## What Changes

- Add request-level contract coverage for the running fixture backend in both JSON and protobuf transport modes.
- Back the fixture backend with real SQLite storage for fixture rows and pushed rows, using in-memory Bun SQLite for contract tests.
- Require the contract tests to exercise `/__reset`, `/__state`, `/sync/status`, `/sync/pull`, and `/sync/push` over HTTP.
- Require backend contract assertions for deterministic seed data, invalid scope handling, pushed row recording, acknowledgements, reset behavior, and response decoding.
- Tighten the public fixture device E2E requirements so desktop smoke must prove app launch, migrations, baseline pull, local create, manual push, backend state, clean local state, and restart persistence.
- Tighten Android verification requirements so Android smoke is only considered verified after running against a real adb target or emulator with recorded evidence.
- Document the verification commands and expected boundaries so device smoke remains opt-in but meaningful.

## Capabilities

### New Capabilities

- `fixture-backend-contracts`: request-level tests for the deterministic SQLite-backed fixture backend across JSON and protobuf transports.

### Modified Capabilities

- `public-fixture-device-e2e`: strengthen desktop/device fixture smoke requirements around deterministic backend state, real HTTP transport, clean local state, and restart persistence.
- `android-fixture-device-e2e-verification`: clarify that Android confidence requires connected-device execution evidence, backend reachability, clean app state, and lifecycle assertions.

## Impact

- Affected files will likely include `tests/e2e/backend/**`, `tests/e2e/desktop/**`, `tests/e2e/android/**`, `tests/e2e/README.md`, and `openspec/knowledge/E2E-TESTING-RUNBOOK.md`.
- No public Baresync runtime API changes are expected.
- Test dependencies should remain within the existing Bun SQLite, Vitest, WebDriverIO, Maestro, adb, and generated protobuf tooling already used by the repo.
