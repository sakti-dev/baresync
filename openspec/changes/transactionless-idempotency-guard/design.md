## Context

The idempotency guard (`createIdempotencyGuard`) in `packages/baresync/src/server/idempotency.ts` wraps all push bookkeeping in `db.transaction()`. The guard performs four sequential operations inside the transaction: load existing batch → reserve (INSERT pending) → callback (consumer's `applyPushChanges`) → finalize (UPDATE to completed).

On Turso/libsql over HTTP, the Drizzle driver creates a stateful Hrana transaction stream. The consumer's `upsertRow` closures capture the root `db` instance, not the transaction `tx`, so every data mutation runs as an independent auto-committed HTTP request. While these out-of-band calls execute, the transaction stream sits idle. Turso's remote coordinator times out the idle stream (~5s). When the guard reaches `finalizePushBatchResponse` or Drizzle's catch block calls `libsqlTx.rollback()`, the stream is already dead, producing `cannot rollback - no transaction is active`.

The `sync_batch_requests` table has a UNIQUE index on `(clientId, idempotencyKey)` which already provides the real concurrency guarantee. The transaction wrapper was redundant even for backends that support it — it only added atomicity for the bookkeeping row, not the data mutations.

## Goals / Non-Goals

**Goals:**
- Eliminate the `db.transaction()` call from the idempotency guard
- Make push work on all Drizzle backends: better-sqlite3, bun:sqlite, libsql (HTTP and embedded), PostgreSQL
- Handle stale pending rows automatically via `pendingTimeoutMs`
- Handle concurrent identical pushes gracefully (UNIQUE constraint on reserve)
- Maintain backward compatibility — no API signature changes for consumers

**Non-Goals:**
- Adding a transactional codepath (with `tx` passed to callback). Research confirmed a single transactionless path is correct for all backends.
- Changing `SyncIdempotencyDatabase` interface or `DrizzleSyncTableConfig` signatures
- Modifying the pull, status, or cleanup codepaths

## Decisions

### D1: Single transactionless path (no dual-mode)

**Decision**: Remove `db.transaction()` entirely. No opt-in/out flag.

**Rationale**: The callback already bypasses the transaction (uses `db`, not `tx`). Adding a "fixed" transactional path would require a breaking API change (`upsertRow` must accept `tx` parameter). The UNIQUE constraint + idempotent upserts provide sufficient guarantees for all backends. Two codepaths would double the test surface and add consumer confusion.

**Alternative considered**: Keep `db.transaction()` for backends that support it. Rejected because the transaction was never protecting data — only bookkeeping — and the crash case (stale pending) is better handled by `pendingTimeoutMs` than by rollback.

### D2: `pendingTimeoutMs` with sane default

**Decision**: Add `pendingTimeoutMs` to guard options, default 30_000 (30 seconds).

**Rationale**: 30s is generous for most push operations while being short enough to unstick a zombie pending row within a reasonable timeframe. The value is configurable for consumers with unusual latency profiles.

### D3: UPDATE stale pending (not DELETE + INSERT)

**Decision**: When a pending row is older than `pendingTimeoutMs`, UPDATE it to reset status and timestamp rather than DELETE + INSERT.

**Rationale**: No window between DELETE and INSERT where a concurrent request could observe no row and attempt a duplicate reserve. The UNIQUE constraint stays satisfied throughout.

### D4: Catch UNIQUE constraint on reserve INSERT

**Decision**: Wrap `reservePushBatchResponse` in try/catch. On UNIQUE constraint error, re-read the row and return the appropriate state (completed → replay, pending → conflict).

**Rationale**: Two concurrent requests can both pass the `loadPushBatchResponse` SELECT check before either INSERTs. The database's unique index is the authoritative arbiter. The guard must handle this gracefully instead of propagating a raw database error.

### D5: Delete pending row on callback failure

**Decision**: If the callback throws, DELETE the pending row (best-effort) before rethrowing.

**Rationale**: Replaces the automatic rollback behavior. Without cleanup, the row stays `pending` and blocks retries until `pendingTimeoutMs` expires. Immediate cleanup lets the client retry right away.

## Risks / Trade-offs

**Race window between SELECT and INSERT**: Two concurrent identical pushes can both see no existing row. Mitigated by UNIQUE constraint catch + re-read (D4). This is standard optimistic concurrency control.

**Partial data application**: If the callback fails mid-way through upserting rows, some data mutations are already committed. On retry, the idempotent `ON CONFLICT DO UPDATE` upserts re-apply the same values — state converges to the correct result. This is inherent to any transactionless design and is safe because the consumer's upserts are idempotent.

**No atomicity for bookkeeping**: load/reserve/finalize are separate auto-committed statements. If the process crashes between reserve and finalize, the row stays pending. Mitigated by `pendingTimeoutMs` (D2) and callback-failure cleanup (D5).
