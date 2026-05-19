# Public Sync Plugin Device Simulation

Phase 14 splits device-like confidence into deterministic host simulation plus small opt-in desktop and Android smoke tests.

The public smoke target is the fixture app in `tests/fixture-app`. It exists so Baresync can prove real consumer integration without depending on private Sakti POS code under `docs/external/sakti-pos`.

For operational E2E setup, commands, debugging, and failure modes, use `docs/knowledge/E2E-TESTING-RUNBOOK.md` as the source of truth.

## Verification Model

Normal verification should stay host-runnable:

- Rust core and plugin command tests cover SQLite, migrations, outbox behavior, push/pull semantics, and Tauri command logic without Android, adb, WebView, or desktop drivers.
- JS tests cover public client APIs and mocked `invoke` behavior without a Tauri runtime.

Desktop and Android smoke tests are opt-in confidence checks. They should prove runtime wiring, lifecycle, IPC, migrations, SQLite persistence, baseline pull, local create, manual sync, and restart/app-data behavior. They should not carry protocol edge cases such as conflicts, idempotency, adaptive chunking, or reconciliation; those belong in host tests.

## Boundary

Keep this boundary intact:

- Public fixture E2E belongs in `tests/fixture-app` and `tests/e2e`.
- Private consumer app automation belongs outside this public fixture path.
- `docs/external/sakti-pos` is not a public E2E target.

This prevents public verification from depending on private routes, auth, assets, data shape, or future downstream app removal.
