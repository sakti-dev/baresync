## Context

The baresync project has completed Waves 1–2 plus the thin vertical sprint. The Rust sync engine (push, pull, reconcile, GC, adaptive chunking) and JS server primitives (cursor, ordering, idempotency, envelope codec) are implemented. Existing test coverage:

- **Rust**: 544 lines in `crates/baresync-core/tests/simulation.rs` testing individual operations (pull apply, push upsert, outbox read, GC) against inline fixtures
- **JS**: 558 lines in `packages/baresync/src/server/__test__/` testing idempotency guard, request hash, and primitive functions against in-memory SQLite
- **Gap**: No test exercises the full lifecycle (pull→push→reconcile→delete→idempotent re-sync) as a connected flow

The PRD Phase 13 specifies ~30 simulation scenarios. This change implements those scenarios as three new capabilities: shared fixtures, JS server simulation, and Rust engine simulation.

## Goals / Non-Goals

**Goals:**
- Create canonical JSON fixtures that define stable protocol shapes for 6 core sync scenarios
- Exercise the full JS server primitive pipeline against those fixtures
- Exercise the full Rust engine lifecycle against fake HTTP backed by those fixture shapes
- Prove the lifecycle works: baseline pull → offline write → push → server delete → reconciliation → GC → idempotent no-op
- All tests run on host without Tauri, Android, or network

**Non-Goals:**
- No protobuf encoding simulation (JSON-only for now; protobuf fixture equivalence deferred)
- No batteries-included server simulation (low-level primitives only)
- No desktop Tauri smoke or Android smoke (that's P14)
- No changes to production code
- No cross-language fixture file sharing via filesystem (Rust fixtures stay inline; JS imports from JSON files)

## Decisions

### D1: Fixture location and format

**Decision**: JS fixtures live in `packages/baresync/fixtures/sync/*.json`. Rust fixtures stay inline in `crates/baresync-core/tests/fixtures.rs` using `serde_json::json!` macros that produce the same shapes.

**Rationale**: Rust integration tests (`tests/`) cannot easily import JSON files from the JS package at compile time. Inline fixtures with the same logical shapes are simpler and compile faster. JS tests import JSON directly via Bun's native JSON imports.

**Alternative considered**: Shared JSON files consumed by both — rejected because Rust `include_str!` from a different workspace package creates fragile cross-package file paths.

### D2: JS server simulation uses in-memory SQLite + Drizzle

**Decision**: JS simulation tests use `bun:sqlite` in-memory databases with `drizzle-orm/bun-sqlite`, matching the existing pattern in `server.test.ts`.

**Rationale**: Consistent with existing test infrastructure. No new dependencies. In-memory SQLite is fast and isolated.

### D3: Rust engine simulation uses fake HTTP client

**Decision**: Rust tests call engine methods directly, mocking HTTP by providing fixture-shaped responses through the existing `http` module abstraction. The engine's `push` and `pull` functions accept config with base URL; tests will use a pattern where the `http` module is exercised through its public interface with fixture responses.

**Rationale**: The current `http.rs` uses `reqwest` directly. Full HTTP mocking (e.g., `wiremock`) is heavy for this scope. Instead, simulation tests exercise the engine's internal functions (pull apply, push build, outbox read) with fixture-shaped `serde_json::Value` inputs, just as the existing simulation tests do. This avoids a mock server dependency while still proving lifecycle correctness.

**Alternative considered**: `wiremock` or `mockito` crate — rejected to avoid new dependencies. The existing test pattern (direct function calls with fixture Values) is sufficient.

### D4: Fixture scenarios

**Decision**: 6 canonical scenarios covering the critical lifecycle paths:

| Fixture | What it proves |
|---------|---------------|
| `category-product-baseline-pull` | Fresh pull applies categories before products (FK order), marks synced |
| `category-product-push` | Push sends outbox in upsert order, clears accepted outbox |
| `server-soft-delete` | Pull with deletedIds soft-deletes rows, clears stale outbox |
| `server-wins-rejection` | Push rejection triggers reconciliation pull, server version overwrites local |
| `idempotent-replay` | Same (clientId, idempotencyKey, requestHash) replays cached response |
| `payload-too-large` | 413 triggers adaptive chunk split; single oversized row errors |

**Rationale**: These 6 cover every requirement in PRD Phase 13's "Minimum scenarios" list for both JS and Rust sides.

### D5: No cross-language fixture file sharing

**Decision**: Rust and JS fixtures are maintained independently but must produce logically equivalent shapes. A documentation comment in each Rust fixture function maps to the corresponding JS fixture filename.

**Rationale**: Avoids build-time coupling between packages. The shapes are simple and stable. Drift is caught by human review during fixture changes, not by automated comparison.

## Risks / Trade-offs

- **[Risk: Rust fixtures drift from JS fixtures]** → Mitigation: Each Rust fixture function has a comment naming its JS counterpart. Fixture shapes are small and stable. Future work could add a cross-language comparison test.
- **[Risk: Simulation tests are not real HTTP]** → Mitigation: This is intentional. The PRD testing pyramid puts simulation above unit tests and below device smoke. HTTP transport is validated separately.
- **[Risk: In-memory SQLite differs from file-backed SQLite]** → Mitigation: Minimal difference for the operations tested. Migration tests already use file-backed SQLite. Simulation focuses on sync logic, not SQLite behavior.
- **[Risk: Test runtime increases significantly]** → Mitigation: In-memory SQLite and inline fixtures are fast. Target: all simulation tests complete in < 10 seconds total.
