## 1. Protocol Fixtures

- [x] 1.1 Create `packages/baresync/fixtures/sync/category-product-baseline-pull.json` — pull response with categories (1 changed row) and products (1 changed row with FK to categories), valid cursor, hasMore: false, scopeId "merchant-1"
- [x] 1.2 Create `packages/baresync/fixtures/sync/category-product-push.json` — push request body with categories and products in upsert order, scopeId, clientId, idempotencyKey, tables
- [x] 1.3 Create `packages/baresync/fixtures/sync/server-soft-delete.json` — pull response with products in deletedIds ["prod-1"], empty changedRows for products
- [x] 1.4 Create `packages/baresync/fixtures/sync/server-wins-rejection.json` — push response with rejected categories (reason "server_newer") and follow-up pull with server's category version
- [x] 1.5 Create `packages/baresync/fixtures/sync/idempotent-replay.json` — two push request bodies sharing identical (clientId, idempotencyKey, requestHash)
- [x] 1.6 Create `packages/baresync/fixtures/sync/payload-too-large.json` — push body exceeding 256 KiB with multiple rows in at least one table

## 2. JS Server Simulation Tests

- [x] 2.1 Create `packages/baresync/src/server/__test__/fixtures.ts` — helper module that imports all fixture JSON files and re-exports them as typed constants
- [x] 2.2 Create `packages/baresync/src/server/__test__/simulation.test.ts` — test harness with `createTestDb()` factory (in-memory SQLite + Drizzle, sync_batch_requests table)
- [x] 2.3 Add test: baseline pull fixture tables are ordered by `orderPushChanges` in FK order (categories before products)
- [x] 2.4 Add test: push with reversed table order is reordered by `orderPushChanges`
- [x] 2.5 Add test: idempotent push replay — same (clientId, idempotencyKey, requestHash) replays cached response, callback invoked exactly once
- [x] 2.6 Add test: idempotency key conflict — same key with different requestHash throws ConflictRequestError
- [x] 2.7 Add test: oversized push body exceeds maxBytes in `validatePushEnvelope` and throws
- [x] 2.8 Add test: row count overflow exceeds maxRows in `validatePushEnvelope` and throws
- [x] 2.9 Add test: invalid cursor string throws in `parseSyncCursor`
- [x] 2.10 Add test: server-soft-delete fixture has products in deletedIds with empty changedRows
- [x] 2.11 Add test: `cleanupSyncBatchRequests` deletes old completed rows, preserves newer rows
- [x] 2.12 Add test: `cleanupSyncBatchRequests` dry-run reports counts without deleting
- [x] 2.13 Add test: `cleanupSyncBatchRequests` preserves pending rows by default
- [x] 2.14 Add test: full server primitive pipeline — decode → validate → order → idempotency guard → encode response

## 3. Rust Engine Simulation Tests

- [x] 3.1 Add fixture function to `crates/baresync-core/tests/fixtures.rs`: `baseline_pull_response()` matching category-product-baseline-pull.json shape
- [x] 3.2 Add fixture function: `push_rejection_response()` with rejected category (server_newer) and reconciliation pull response with server's category version
- [x] 3.3 Add fixture function: `soft_delete_pull_response()` with products in deletedIds
- [x] 3.4 Add test: baseline pull applies categories before products, marks is_synced = 1 (already exists, verify coverage)
- [x] 3.5 Add test: local offline inserts create outbox entries for categories and products
- [x] 3.6 Add test: push reads outbox in upsert order and marks accepted outbox rows as synced
- [x] 3.7 Add test: pull with deletedIds soft-deletes product row (deleted_at set, is_synced = 1)
- [x] 3.8 Add test: server-wins push rejection triggers reconciliation pull that overwrites local with server version
- [x] 3.9 Add test: adaptive chunking splits on simulated 413 response — chunk of 4 rows splits into [2, 2]
- [x] 3.10 Add test: single-row chunk with 413 returns SingleRowTooLarge error
- [x] 3.11 Add test: cursor advances after successful pull, does not advance on failure
- [x] 3.12 Add test: full sync lifecycle — seed → baseline pull → local writes → push → server delete pull → GC → idempotent re-sync
- [x] 3.13 Add test: embedded migrations applied once, skipped on second run
- [x] 3.14 Add test: run_sql_batch rolls back all statements when one fails

## 4. Extended Simulation — Edge Cases

- [x] 4.1 Add Rust test: push with partial acceptance — some rows accepted, some rejected in same table; accepted marked synced, rejected remain in outbox
- [x] 4.2 Add Rust test: re-sync after server-wins reconciliation — rejection → pull → new local write → second push succeeds
- [x] 4.3 Add Rust test: outbox coalescing insert→delete→insert coalesces to final insert (not delete or no-op)
- [x] 4.4 Add Rust test: paginated pull with hasMore=true then hasMore=false — both batches applied, cursor at final value
- [x] 4.5 Add Rust test: pull with mixed changedRows + deletedIds on same table — prod-2 upserted, prod-1 soft-deleted
- [x] 4.6 Add Rust test: push with deletes only (no changedRows) — valid envelope built, outbox cleared after acceptance
- [x] 4.7 Add JS test: pull with mixed changedRows and deletedIds on same table — orderPushChanges preserves both
- [x] 4.8 Add JS test: push with deletes only — validatePushEnvelope passes, countPushRows counts deletedIds
- [x] 4.9 Add JS test: re-sync pipeline after ConflictRequestError — new idempotency key succeeds through full pipeline

## 5. Verification (Extended)

- [x] 5.1 Run `bun test packages/baresync/src/server` — all JS tests pass
- [x] 5.2 Run `cargo test -p baresync-core --test simulation` — all Rust simulation tests pass
- [x] 5.3 Run `cargo test --workspace` — full Rust suite passes
- [x] 5.4 Run `bun x ultracite check` — lint passes
