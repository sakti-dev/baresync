## Context

The public fixture app is the repo-owned E2E consumer for Baresync. It already gives useful desktop and Android smoke coverage, but the fixture backend is currently a process-local deterministic harness. That makes the server easy to run, but weakens confidence that the fixture flow exercises realistic persistence and protocol boundaries.

This change adds a stronger middle layer: request-level contract tests against the running fixture backend, backed by a real SQLite database. These tests remain host-side and fast, while desktop and Android smoke tests continue to prove real Tauri, WebView, SQLite file, IPC, networking, and lifecycle behavior.

## Goals / Non-Goals

**Goals:**

- Prove the fixture backend contract through real HTTP requests in both JSON and protobuf modes.
- Make the fixture backend store seed data, pushed data, and reset state in SQLite rather than in process arrays.
- Keep contract tests deterministic by using in-memory Bun SQLite and free per-test ports.
- Ensure desktop and Android smoke requirements assert real user-visible and backend-visible outcomes.
- Document verification commands clearly enough that maintainers know what is host-verifiable and what requires a real device.

**Non-Goals:**

- Do not move protocol edge cases such as idempotency conflicts, chunk splitting, or conflict resolution into device smoke tests.
- Do not require Android smoke in the normal local check path.
- Do not depend on private downstream apps or schemas.
- Do not change the public Baresync runtime API.

## Decisions

1. Use SQLite-backed fixture backend state.

   The backend should own a small SQLite schema for fixture categories, products, and pushed rows. Contract tests should configure it to use `:memory:` so each server process starts clean. If a file path is later needed for debugging, it can be exposed through an environment variable without changing the tests.

2. Test the running server, not only pure functions.

   The new contract tests should spawn `tests/e2e/backend/fixture-server.ts`, wait for `/__state`, send HTTP requests to all sync endpoints, and decode responses. This catches routing, request decoding, response encoding, reset behavior, and DB state changes in one focused layer.

3. Cover JSON and protobuf through the same scenario.

   The contract test should run the same logical request sequence in `json` and `protobuf` modes. Protobuf requests and responses should use the generated fixture protobuf runtime so the test matches the public fixture app transport path.

4. Keep device smoke small but meaningful.

   Desktop and Android smoke tests should focus on runtime wiring: app launch, migrations, DB path/run isolation, baseline pull, local create, manual push, clean local state, backend state, and restart persistence. Deeper sync semantics remain in host Rust and JS simulation suites.

5. Treat Android verification as opt-in evidence.

   Android smoke can stay opt-in because it requires adb, emulator/device state, backend reachability, and installed app lifecycle. The spec should still require recorded command evidence before declaring Android behavior verified.

## Risks / Trade-offs

- SQLite-backed backend adds slightly more setup than arrays -> mitigate with a tiny schema and explicit reset helper.
- Contract tests spawn a server process -> mitigate with free ports, readiness polling, and guaranteed cleanup.
- Protobuf assertions can drift from the app transport -> mitigate by using the generated fixture protobuf runtime rather than hand-built bytes.
- Device tests can become slow or flaky -> keep detailed sync edge cases in host tests and reserve smoke tests for real boundary confidence.
