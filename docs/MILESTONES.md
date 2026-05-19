# Baresync Milestones

Extraction-based batching of the 18 PRD phases into 4 waves. Extraction
ordering preserves Sakti POS app correctness between phases. Phases within the
same wave can run in parallel because they touch different packages, crates,
and languages with no mutual imports.

## Wave 1 — Shells (Sequential)

Baseline verification and empty package/crate scaffolding.

```
Phase 0: Baseline And Guardrails
Phase 1: Create Package And Crate Shells
```

**Gate**: `cargo test --workspace` and `bun x ultracite check packages/baresync`
pass with empty crates and a minimal `limits.ts`.

---

## Wave 2 — Extraction (Parallel Streams)

Four independent streams extract reusable logic from the Sakti monorepo into
`packages/baresync` and `crates/baresync-core`. Each stream touches different
files, different languages, and different import boundaries.

```
                    Phase 1 (done)
                         │
          ┌──────────────┼──────────────┬──────────────┐
          ▼              ▼              ▼              ▼
   ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
   │ Stream A   │ │ Stream B   │ │ Stream C   │ │ Stream D   │
   │ Generator  │ │ Rust Core  │ │ Server     │ │ Schema     │
   │ (JS/TS)    │ │ (Rust)     │ │ Helpers    │ │ Helpers    │
   └────────────┘ └────────────┘ └────────────┘ └────────────┘
```

### Stream A — Generator (JS/TS)

Extracts `packages/sync-proto-generator` into `packages/baresync/generator`,
then upgrades it to consume contracts, encodings, diagnostics, and table order.

| Phase | Description | Source → Target |
|-------|-------------|-----------------|
| P2 | Extract generator into `packages/baresync` | `packages/sync-proto-generator/src/*` → `packages/baresync/src/generator/*` |
| P5 | Contracts, encodings, diagnostics, table order | New files in `packages/baresync/src/generator/` |

P2 must complete before P5 starts within this stream. P5 depends on Stream D
schema types being available, but the initial P2 extraction does not.

### Stream B — Rust Core Engine

Extracts local SQLite, Drizzle proxy, migrations, outbox, push, pull, and
reconciliation into `crates/baresync-core`.

| Phase | Description | Source → Target |
|-------|-------------|-----------------|
| P7 | Config, limits, error types, empty engine | New files in `crates/baresync-core/src/` |
| P4 | DB, Drizzle proxy, migration runner | `apps/pos-app/src-tauri/src/db/*` → `crates/baresync-core/src/{db,drizzle_proxy,migrations}.rs` |
| P8 | Outbox, schema, cursor, chunking | `apps/pos-app/src-tauri/src/sync/{schema,outbox,local_state,push}.rs` → `crates/baresync-core/src/{schema,outbox,cursor,push}.rs` |
| P9 | Pull and reconciliation | `apps/pos-app/src-tauri/src/sync/{pull,protobuf,dto}.rs` → `crates/baresync-core/src/{pull,reconcile}.rs` |

Internal ordering within Stream B:

```
P7 (types) ──► P4 (db/proxy/migrations) ──► P8 (outbox/cursor/chunking) ──► P9 (pull/reconcile)
```

P7 can start immediately after Wave 1. P4, P8, and P9 are sequential within
Stream B because later phases import from earlier ones.

### Stream C — Server Helpers (JS/TS)

Extracts reusable server sync primitives from `apps/api/src/sync/`.

| Phase | Description | Source → Target |
|-------|-------------|-----------------|
| P6 | Server limits, chunking, idempotency, routes, primitives | `apps/api/src/sync/*` → `packages/baresync/src/server/*` |

P6 can start after Stream D schema types (`syncServerSchema`,
`defineSyncedTable`) are available, but the initial extraction of chunking
constants and limit validation does not depend on them. Practical start: after
P3 lands or in parallel if initial work avoids schema helper imports.

### Stream D — Schema Helpers (JS/TS)

Creates row-state column helpers, `defineSyncedTable`, `defineSyncContract`,
and `syncSchema`.

| Phase | Description | Source → Target |
|-------|-------------|-----------------|
| P3 | Row-state helpers, synced table, contract, validation | New files in `packages/baresync/src/schema/` |

No source extraction dependency. P3 can start immediately after Wave 1. P3
output is consumed by P5 (generator), P6 (server), and P12 (JS client).

### Stream Dependencies

```
Stream D (P3) ──────► Stream A (P5, schema-aware generator work)
                ──────► Stream C (P6, server schema usage)
                ──────► Wave 3 (P12, JS client types)

Stream B has no cross-stream dependency.
Stream A P2 (initial extraction) has no cross-stream dependency.
```

**Gate for Wave 2**: All four streams complete. Existing Sakti tests still pass.

---

## Wave 3 — Integration (Sequential Convergence)

Wires the extracted streams into a working Tauri plugin, connects the JS
client, and runs the full simulation harness.

```
Phase 10: Tauri Plugin Wrapper       (needs Stream B done)
Phase 11: Generated Rust Mappers      (needs Stream A + Stream B done)
Phase 12: JS Tauri Client Wrapper     (needs P10 + Stream D done)
Phase 13: Host-Only Sync Simulation   (needs P6 + P12 + Stream B done)
Phase 14: Device-Like Simulation      (needs P13 done)
```

Internal ordering:

```
P10 ──► P11 ──► P12 ──► P13 ──► P14
```

P10 and P11 could potentially overlap if the Rust mapper trait boundary is
defined early, but sequential is safer for extraction.

**Gate for Wave 3**: Simulation tests pass on host without Android/device.

---

## Wave 4 — Polish (Mixed)

App migration, documentation, example, and publishing readiness.

```
Phase 15: App Migration           (sequential, needs Wave 3)
     │
     ├──── Phase 16: Public Documentation   (parallel)
     └──── Phase 17: Example App            (parallel)
               │
          Phase 18: Publishing Readiness     (sequential, needs P16 + P17)
```

P16 and P17 can run in parallel after P15 completes.

**Gate for Wave 4**: Full verification suite passes, example app works, docs
reviewed.

---

## Summary

| Wave | Phases | Duration Estimate | Parallelism |
|------|--------|-------------------|-------------|
| 1 | P0, P1 | S | Sequential |
| 2 | P2, P3, P4, P5, P6, P7, P8, P9 | L | 4 streams, ~2 per stream |
| 3 | P10, P11, P12, P13, P14 | M | Sequential |
| 4 | P15, P16, P17, P18 | M | P16+P17 parallel |

## Risk: Cross-Stream Concept Drift

All four streams in Wave 2 share concepts: row-state column names, cursor
format, table order constants, encoding shape. Parallel extraction risks
drift between streams if these concepts are defined independently.

Mitigation: Stream D (P3 schema helpers) owns the canonical definitions. Other
streams should import from `packages/baresync/schema` as soon as P3 lands,
rather than duplicating column names or cursor formats in stream-local code.

## Commit Boundaries Per Wave

Wave 1:

1. `chore(sync): verify baseline and registry availability`
2. `chore(sync): add public sync package and rust workspace shells`

Wave 2 (Stream A):

3. `refactor(sync): expose contract generator through sync package`
4. `feat(sync): generate sync table order from drizzle foreign keys`
5. `feat(sync): add json and protobuf encoding contract`

Wave 2 (Stream B):

6. `refactor(sync): extract rust sync core types and config`
7. `feat(sync): extract local sqlite drizzle proxy runtime`
8. `refactor(sync): extract rust outbox cursor and chunking logic`
9. `refactor(sync): extract rust pull and reconciliation logic`

Wave 2 (Stream C):

10. `refactor(sync): extract reusable server sync helpers`

Wave 2 (Stream D):

11. `feat(sync): add drizzle row-state schema helpers`

Wave 3:

12. `feat(sync): add tauri sync plugin wrapper`
13. `refactor(sync): wire generated rust mappers into core`
14. `feat(sync): add js tauri client wrapper`
15. `test(sync): add host-only sync simulation harness`
16. `test(sync): add device-like plugin simulation harness`

Wave 4:

17. `refactor(pos): run db and sync through tauri plugin`
18. `docs(sync): document public tauri sync plugin`
19. `test(sync): add public plugin example app`
20. `chore(sync): publishing readiness`
