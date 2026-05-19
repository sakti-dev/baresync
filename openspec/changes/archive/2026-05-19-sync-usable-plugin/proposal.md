## Why

The `baresync-thin-vertical` change proved the sync engine works end-to-end with push, pull, outbox coalescing, and integration tests. But no real Tauri app can consume it yet: there is no plugin registration surface, no JS client wrapper, no server-side idempotency guard, no adaptive 413 chunking, and no reconciliation of rejected (server-wins) push rows. This change bridges the gap between "engine works in tests" and "a consumer can register baresync as a Tauri plugin and actually sync data."

## What Changes

- Add reconciliation orchestration: `sync_now` performs pull → push → if rejected rows exist, re-pull from baseline for rejected tables only → garbage collection
- Add adaptive 413 push chunking: flatten table rows into per-row units, greedy bin-pack by row count and byte size, stack-based retry loop that splits chunks in half on 413
- Add `PullStartCursor` enum (Baseline vs Stored) to the pull client
- Add server-side idempotency guard: `createIdempotencyGuard({ db })` with load → reserve (pending sentinel) → execute → finalize flow
- Add `cleanupSyncBatchRequests({ db, olderThanMs, ... })` for cron-safe idempotency record cleanup
- Add `computeSyncRequestHash` (SHA-256 of serialized JSON push body)
- Add Tauri plugin Builder: `Builder::new().api_base_url(...).max_push_bytes(...).build()` returning a `TauriPlugin`
- Add plugin state management (pool, config, contract tables) and all 10 plugin commands (7 sync + 3 DB)
- Add JS client wrapper: `createSyncClient({ apiUrl, encoding, scopeId })` with methods `syncNow`, `push`, `pull`, `getState`, `fullResync`
- Add garbage collection: purge soft-deleted synced rows
- Add `purge_synced_outbox`: clean old synced outbox entries
- Add `get_sync_local_state`: expose dirty count, cursor, and baseline-needed flag
- Add client identity persistence: stable `clientId` stored per device

## Capabilities

### New Capabilities

- `sync-engine-completion`: Reconciliation orchestration (sync_now), PullStartCursor enum, garbage collection, outbox purge, local state query, client identity persistence
- `adaptive-chunking`: Per-row flattening, greedy bin-pack, stack-based 413 split-retry loop, single-row-too-large error
- `tauri-plugin-builder`: Builder pattern, plugin state, plugin registration, all 10 commands
- `js-sync-client`: createSyncClient wrapper, Tauri invoke calls, browser-test-safe mocking
- `server-idempotency`: createIdempotencyGuard, reserve/execute/finalize flow, request hashing, conflict detection
- `server-cleanup`: cleanupSyncBatchRequests with bounded deletes, dry-run, stale-pending threshold

### Modified Capabilities

- `sync-push-client`: Add chunking structs (PendingTablePush), chunk/split functions, and the full adaptive push loop with 413 retry
- `sync-pull-client`: Add PullStartCursor enum (Baseline vs Stored), used by sync_now for reconciliation pulls
- `local-database`: Add client identity persistence table and helpers
- `server-push-primitives`: Add computeSyncRequestHash, wire idempotency guard into decode flow

## Impact

- **Rust crates**: `baresync-core` gains reconcile orchestration, chunking, GC, client identity, local state query. `tauri-plugin-baresync` gains Builder, state, and 10 commands.
- **JS package**: `packages/baresync/src/tauri/` gains client wrapper. `packages/baresync/src/server/` gains idempotency guard and cleanup.
- **API surface**: New subpath exports `baresync/tauri` and additions to `baresync/server`.
- **Tests**: New integration tests for reconciliation, adaptive chunking, idempotency replay/conflict, GC, and plugin command wiring.
- **Dependencies**: `sha2` crate already in use; no new Rust dependencies expected. JS side uses Web Crypto API (already available).
