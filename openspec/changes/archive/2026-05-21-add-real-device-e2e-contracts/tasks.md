## 1. SQLite-Backed Fixture Backend

- [x] 1.1 Refactor `tests/e2e/backend/fixture-server.ts` so fixture categories, products, and pushed rows are stored in SQLite rather than process-local arrays.
- [x] 1.2 Add backend reset logic that clears pushed rows and restores deterministic seed rows through SQLite.
- [x] 1.3 Preserve existing `/__reset`, `/__state`, `/sync/status`, `/sync/pull`, and `/sync/push` endpoint behavior while reading and writing through the database.
- [x] 1.4 Add configuration for isolated in-memory Bun SQLite in tests and deterministic backend storage in smoke runs.

## 2. Backend Contract Tests

- [x] 2.1 Add request-level contract tests that start the real fixture backend on an isolated port and stop it after each run.
- [x] 2.2 Cover JSON status, pull, push, reset, state, invalid scope, pushed row persistence, and post-reset state.
- [x] 2.3 Cover the same logical scenario in protobuf mode using the generated fixture protobuf runtime for request encoding and response decoding.
- [x] 2.4 Add or document a host-side command for running the backend contract tests without Tauri, adb, Maestro, or tauri-driver.

## 3. Device Smoke Alignment

- [x] 3.1 Update desktop smoke assertions or documentation so they explicitly rely on the same backend reset/state/push behavior covered by the contract tests.
- [x] 3.2 Update Android smoke assertions or runner documentation so backend reachability, backend reset, app readiness, baseline pull, manual push, clean local state, and restart persistence are explicit.
- [x] 3.3 Update `tests/e2e/README.md` and `openspec/knowledge/E2E-TESTING-RUNBOOK.md` with backend contract commands and real-device verification boundaries.

## 4. Verification

- [x] 4.1 Run `bun x ultracite check`.
- [x] 4.2 Run `bun x ultracite fix` if safe formatting or lint fixes are reported, then re-run `bun x ultracite check`.
- [x] 4.3 Run the repo typecheck script.
- [x] 4.4 Run `bun run typecheck` in `tests/e2e`.
- [x] 4.5 Run the backend contract tests in JSON and protobuf modes.
- [x] 4.6 Run desktop smoke if the local environment has the required Tauri/driver tooling, or document why it was not run.
- [x] 4.7 Run Android smoke against a connected adb target if available, or leave Android verification explicitly pending with the exact command to run.
