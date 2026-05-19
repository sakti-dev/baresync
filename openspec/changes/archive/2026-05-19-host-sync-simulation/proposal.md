## Why

We have 160 unit tests covering individual primitives (cursor parsing, diagnostics, chunking, idempotency, migration runner), but zero tests proving the full sync cycle works end-to-end: pull baseline → push outbox → server-wins reconciliation → delete → idempotent no-op. The Rust engine has 544 lines of simulation tests using inline fixtures, and the JS server has 296 lines of idempotency tests using in-memory SQLite, but neither exercises the cross-cutting lifecycle. Without simulation, regressions in the interaction between push, pull, reconciliation, and garbage collection are invisible until device testing.

## What Changes

- Add canonical JSON fixtures that define stable protocol shapes for category/product push, pull, server-delete, server-wins, idempotent replay, and payload-too-large scenarios
- Add JS server simulation tests that exercise low-level server primitives (decode → validate → order → idempotency → encode) against these fixtures using in-memory SQLite
- Expand Rust engine simulation tests to exercise the full push→pull→reconcile→GC lifecycle using fake HTTP responses backed by the same fixture shapes
- Add cross-language fixture equivalence test: Rust fixture JSON must parse identically in JS and vice versa

## Capabilities

### New Capabilities
- `sync-protocol-fixtures`: Canonical JSON fixtures defining stable protocol shapes for all sync scenarios (push, pull, delete, server-wins, idempotent replay, payload-too-large), shared between JS and Rust test suites
- `js-server-simulation`: JS simulation tests that exercise the full low-level server primitive pipeline (decode → validate → order → idempotency guard → encode) against protocol fixtures with in-memory SQLite
- `rust-engine-simulation`: Rust integration tests that exercise the full local sync engine lifecycle (baseline pull → offline write → push → server delete pull → reconciliation → GC → idempotent re-sync) against fake HTTP responses backed by fixture shapes

### Modified Capabilities
- (none — all existing specs remain unchanged; this is additive testing infrastructure)

## Impact

- New files under `packages/baresync/fixtures/sync/` (6 JSON fixture files)
- New test files under `packages/baresync/src/server/__test__/` (simulation.test.ts, fixtures.ts)
- Expanded test files under `crates/baresync-core/tests/` (simulation.rs, fixtures.rs)
- No changes to production code — this is purely test infrastructure
- No changes to existing specs — these tests validate already-specified behavior
- Test runtime increases but remains host-only (no Tauri, no Android, no network)
