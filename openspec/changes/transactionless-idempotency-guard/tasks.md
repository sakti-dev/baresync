## 1. Tests — Transactionless guard core

- [ ] 1.1 Write test: push succeeds without transaction — new idempotency key inserts pending, runs callback, updates to completed
- [ ] 1.2 Write test: push replay returns cached response — completed row with matching hash returns stored responseBody without calling callback
- [ ] 1.3 Write test: push with completed row but different hash throws ConflictRequestError
- [ ] 1.4 Write test: push with fresh pending row throws ConflictRequestError
- [ ] 1.5 Write test: push with stale pending row (age ≥ pendingTimeoutMs) reclaims and succeeds

## 2. Tests — UNIQUE constraint handling

- [ ] 2.1 Write test: reserve INSERT UNIQUE constraint error triggers re-read — if row is now completed with matching hash, returns cached response
- [ ] 2.2 Write test: reserve INSERT UNIQUE constraint error triggers re-read — if row is now pending, throws ConflictRequestError

## 3. Tests — Callback failure cleanup

- [ ] 3.1 Write test: callback throws — pending row is deleted and original error propagates
- [ ] 3.2 Write test: callback throws and cleanup also fails — original error still propagates (cleanup error swallowed)

## 4. Tests — pendingTimeoutMs wiring

- [ ] 4.1 Write test: createSyncServer without pendingTimeoutMs uses 30_000ms default
- [ ] 4.2 Write test: createSyncServer with explicit pendingTimeoutMs overrides default

## 5. Tests — Existing regression

- [ ] 5.1 Verify existing handler tests still pass (replay, ordering, scope denial, pull limit, status)

## 6. Implementation — Refactor createIdempotencyGuard

- [ ] 6.1 Add `pendingTimeoutMs` option to guard (default 30_000)
- [ ] 6.2 Replace `db.transaction(async (tx) => { ... })` with sequential operations on `db` directly
- [ ] 6.3 Implement stale pending reclamation: UPDATE row to reset status/timestamp when age ≥ pendingTimeoutMs
- [ ] 6.4 Implement UNIQUE constraint catch on reserve INSERT: catch error, re-read row, return appropriate state
- [ ] 6.5 Implement callback failure cleanup: DELETE pending row on error (best-effort), rethrow original error
- [ ] 6.6 Run all tests from phases 1-5 — all must pass

## 7. Implementation — Wire pendingTimeoutMs through createSyncServer

- [ ] 7.1 Add optional `pendingTimeoutMs` to `SyncServerOptions`
- [ ] 7.2 Pass `pendingTimeoutMs` from `createSyncServer` to `createPushHandler` to `createIdempotencyGuard`
- [ ] 7.3 Run all tests — all must pass
