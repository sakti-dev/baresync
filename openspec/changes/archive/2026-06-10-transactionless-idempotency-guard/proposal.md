## Why

The idempotency guard wraps all push bookkeeping in `db.transaction()`, which fails on Turso/libsql over HTTP with `cannot rollback - no transaction is active`. The remote transaction stream times out while the callback runs out-of-band network calls against `db` (not `tx`). This makes sync push unusable on serverless runtimes with HTTP-based databases.

## What Changes

- **Remove `db.transaction()` from `createIdempotencyGuard`** — run load/reserve/callback/finalize as sequential auto-committed operations on `db` directly.
- **Add `pendingTimeoutMs` (default 30s)** — stale pending rows (from crashed/timed-out pushes) are reclaimed on retry instead of blocking forever.
- **Handle UNIQUE constraint on reserve INSERT** — concurrent identical pushes hit the `sync_batch_requests_client_idemp_idx` unique index; catch the error, re-read, return appropriate state.
- **Delete pending row on callback failure** — explicit cleanup replaces automatic rollback.
- **No API signature changes** — `SyncIdempotencyDatabase`, `createSyncServer`, and handler types remain the same. Consumers don't need to touch anything.

## Capabilities

### New Capabilities

- `transactionless-guard`: Replaces the transactional idempotency guard with a constraint-driven, transactionless implementation that works on all Drizzle backends (better-sqlite3, bun:sqlite, libsql HTTP, PostgreSQL).
