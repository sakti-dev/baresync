# Baresync Milestones

This document tracks the implementation order for the current `baresync` repo.
The old wave grouping was too coarse, so the checklist at the bottom is the
source of truth for progress.

## Current Order

1. Phase 0 - Baseline and guardrails
2. Phase 1 - Create package and crate shells
3. Phase 2 - Extract shared JS sync contract generator
4. Phase 3 - Add Drizzle row-state schema helpers
5. Phase 4 - Extract local SQLite, Drizzle proxy, and migration runner
6. Phase 5 - Make the generator consume contracts, encodings, and table order
7. Phase 6 - Extract server helpers
8. Phase 7 - Create Rust core engine
9. Phase 8 - Extract Rust outbox, schema, cursor, and chunking logic
10. Phase 9 - Extract Rust pull and reconciliation logic
11. Phase 10 - Create Tauri plugin wrapper
12. Phase 11 - Generated Rust mapper integration
13. Phase 12 - JS Tauri client wrapper
14. Phase 13 - Host-only sync simulation harness
15. Phase 14 - Device-like simulation harness
16. Phase 15 - Full device automation
17. Phase 16 - Public documentation
18. Phase 17 - Example app
19. Phase 18 - Publishing readiness
20. Phase 19 - App migration to public-like surface

## What This Means Now

- The repo contains the extracted work for the early PRD phase groups, but the
  implementation path was not linear.
- Several PRD phases were bundled into larger OpenSpec changes, so the work does
  not map 1:1 to the original phase boundaries.
- Phase 14 is complete in this repo: the host simulation checks and public
  fixture smoke flows now exist.
- Phase 15 is complete in this repo: the public `apps/baresync-fixture` target
  is the supported desktop and Android smoke app, and the connected Android
  verification path has been proven against a real adb target.
- Phase 16 is complete in this repo: the public documentation and E2E runbook
  now describe the verified fixture and Android workflows.
- Phases 17 through 19 are the example app, publishing readiness, and final
  consumer-app migration sequence.

## Deferred On Purpose

These items were intentionally left out or postponed and should stay visible:

- Protobuf protocol wiring and protobuf-specific generator/runtime polish
- Device-like simulation coverage beyond the host-only harness
- Consumer-app migration to the public-like surface
- Public documentation, example app, and publishing readiness

## Phase 14 Breakdown

If you want to keep the next chunk small, work on Phase 14 in this order:

1. Host tests for plugin command handlers
2. JS client tests with mocked Tauri `invoke`
3. Desktop smoke skeleton
4. Android smoke skeleton

Phase 14 should only be marked complete after all of these are true:

- Plugin command host tests pass
- JS Tauri client invoke simulation tests pass
- Desktop and Android smoke skeletons exist and are documented as opt-in
- Device simulation documentation has been reviewed
- Full repo verification passes

## Tracking Checklist

- [x] Phase group 1 - Baseline, shells, schema helpers, and generator extraction
- [x] Phase group 2 - Rust core, local DB, push/pull, and server primitives
- [x] Phase group 3 - Plugin wrapper, Rust mapper integration, and JS client
- [x] Phase group 4 - Host-only sync simulation harness
- [x] Phase 14 - Device-like simulation harness
- [x] Phase 15 - Full device automation
- [x] Phase 16 - Public documentation
- [ ] Phase 17 - Example app
- [ ] Phase 18 - Publishing readiness
- [ ] Phase 19 - App migration to public-like surface
