## Context

Phase 14 established host-runnable plugin command tests, mocked JS `invoke` tests, and opt-in desktop/Android smoke skeletons. Those checks prove most sync behavior without a device, but they do not prove that a public consumer can register the plugin, initialize SQLite, run embedded migrations, use the JS client, use the Drizzle proxy, and survive real Tauri desktop or Android lifecycle boundaries.

The Sakti POS app exists in `docs/external/sakti-pos`, but it is not an acceptable public E2E target because it will become private and would confuse maintainers. This change introduces a repo-owned fixture app whose only job is to demonstrate the public Baresync integration pattern.

## Goals / Non-Goals

**Goals:**

- Add a minimal public Tauri fixture app that consumes Baresync like a real app.
- Drive the fixture app through opt-in desktop and Android automation.
- Prove plugin registration, Tauri IPC, embedded migrations, Drizzle proxy commands, SQLite persistence, baseline pull, local create, push, restart, and app-data reset behavior.
- Keep normal CI free of desktop GUI, Android, adb, emulator, and WebView requirements.
- Keep the fixture small enough to serve as a public integration example for private apps.

**Non-Goals:**

- Do not wire `docs/external/sakti-pos` into public E2E.
- Do not migrate Sakti POS in this change.
- Do not encode conflict/idempotency/adaptive-chunking edge cases in desktop or Android UI scripts.
- Do not make device automation mandatory in normal CI.
- Do not change public sync protocol semantics.

## Decisions

### Use a repo-owned fixture app instead of Sakti POS

The fixture app will live in a public workspace path and use a deliberately small schema such as categories/products. This keeps maintainers focused on Baresync integration rather than private app behavior.

Alternative considered: drive `docs/external/sakti-pos/apps/pos-app` directly. That gives higher downstream confidence but couples public repo automation to private app code, auth, routes, assets, and future removal. It is rejected for this change.

### Keep the fixture app intentionally narrow

The app should expose stable E2E controls for setup, manual sync, local row creation, persisted row display, DB info, and reset/status inspection. It should not become a sample POS or broad demo app.

Alternative considered: build a polished example app now. That belongs later in public documentation/example phases. This change only needs a durable automation target.

### Use deterministic local test data and a fixture backend

The E2E flows need deterministic server state. The implementation can use a lightweight local test backend, fixture-backed HTTP handlers, or a small in-process service launched by scripts. The key requirement is state isolation per run.

Alternative considered: use a live external backend. That would add credentials, network flakiness, and account state coupling, so it is rejected.

### Keep desktop and Android automation opt-in

Host verification remains the normal correctness loop. Desktop and Android commands should be explicit scripts with documented prerequisites and environment variables.

Alternative considered: add device smoke to normal CI immediately. That would slow feedback and make CI availability depend on GUI/mobile infrastructure before the project has that investment.

### Collect failure artifacts without leaking private data

The fixture app and scripts should collect logs and, when practical, DB snapshots on failure. The fixture data is synthetic, so these artifacts are safe to keep as debugging evidence.

Alternative considered: rely only on runner output. That is insufficient for device failures where lifecycle, filesystem, and IPC failures often require logs or DB state.

## Risks / Trade-offs

- Fixture app drift from real consumers -> Keep it wired through the same public APIs private apps must use, and avoid fixture-only shortcuts around plugin registration, migrations, or IPC.
- Device E2E flakiness -> Keep flows short, reset state per run, use stable selectors, and leave device automation opt-in.
- Over-testing sync algorithms in UI -> Restrict desktop/Android scenarios to integration and lifecycle confidence; keep algorithmic cases in host suites.
- Tooling burden for contributors -> Document prerequisites clearly and keep normal verification commands independent of WebDriver, Maestro, Android, or adb.
- Android setup variance -> Prefer Maestro for UI flow and allow environment variables for app id, ready text, server URL, and artifact paths.

## Migration Plan

This is additive. Existing host tests and skeleton files continue to work during implementation, then the skeletons are replaced by real fixture-driven flows.

Rollback is straightforward: remove the fixture app, scripts, and E2E updates without changing production Baresync protocol behavior.

## Open Questions

- Exact fixture app path: likely `apps/fixture-tauri-sync` or `apps/baresync-fixture`.
- Exact local backend strategy: standalone script, fixture HTTP server in `packages/e2e`, or app-embedded test server.
- Whether Android automation should install the built APK from a configured path or assume the app is already installed.
