## ADDED Requirements

### Requirement: Transactionless execution model

The idempotency guard MUST execute load/reserve/callback/finalize as sequential auto-committed operations on the database client directly, without wrapping them in `db.transaction()`.

#### Scenario: Push succeeds without transaction
- **WHEN** a push request arrives with a new idempotency key
- **THEN** the guard loads the batch row (null), inserts a pending row, runs the callback, and updates to completed — all as separate auto-committed statements
- **AND** no `BEGIN`/`COMMIT`/`ROLLBACK` is issued

#### Scenario: Push replay without transaction
- **WHEN** a push request arrives with an already-completed idempotency key and matching request hash
- **THEN** the guard returns the cached response body without calling the callback
- **AND** no database write occurs

### Requirement: Stale pending reclamation via pendingTimeoutMs

The guard MUST accept a `pendingTimeoutMs` option (default 30_000ms). When `loadPushBatchResponse` returns a row with `status === "pending"` and `createdAt` older than `pendingTimeoutMs`, the guard MUST treat it as stale and reclaim it.

#### Scenario: Stale pending reclaimed
- **WHEN** a push request arrives and the existing batch row has status `"pending"` and age ≥ `pendingTimeoutMs`
- **THEN** the guard UPDATES the row (resets status to `"pending"`, new timestamp) and proceeds to run the callback

#### Scenario: Fresh pending rejected
- **WHEN** a push request arrives and the existing batch row has status `"pending"` and age < `pendingTimeoutMs`
- **THEN** the guard throws `ConflictRequestError("sync push is already in progress")`

### Requirement: UNIQUE constraint handling on reserve

The guard MUST handle the case where two concurrent requests both pass the SELECT check and attempt INSERT against the `sync_batch_requests_client_idemp_idx` unique index.

#### Scenario: Concurrent push — UNIQUE constraint on INSERT
- **WHEN** `reservePushBatchResponse` INSERT fails with a UNIQUE constraint error
- **THEN** the guard re-reads the row via `loadPushBatchResponse`
- **AND** if the row is now `"completed"` with matching hash, returns the cached response
- **AND** if the row is now `"pending"`, throws `ConflictRequestError`

### Requirement: Pending row cleanup on callback failure

The guard MUST delete the pending `sync_batch_requests` row when the callback throws.

#### Scenario: Callback throws — pending row deleted
- **WHEN** the callback (`applyPushChanges`) throws an error
- **THEN** the guard deletes the pending row (best-effort, errors in cleanup are swallowed)
- **AND** rethrows the original callback error

### Requirement: Backward compatibility

The public API surface MUST NOT change. `SyncIdempotencyDatabase`, `createSyncServer`, handler option types, and `DrizzleSyncTableConfig` signatures remain identical.

#### Scenario: Existing consumer code compiles without changes
- **WHEN** a consumer upgrades baresync and has existing `createSyncServer({ db, ... })` code
- **THEN** their code compiles and runs without modification
- **AND** push operations that previously failed on Turso/libsql HTTP now succeed

### Requirement: pendingTimeoutMs wired through createSyncServer

The `createSyncServer` options MUST accept an optional `pendingTimeoutMs` that flows to the idempotency guard.

#### Scenario: Consumer overrides default timeout
- **WHEN** `createSyncServer({ db, pendingTimeoutMs: 60_000, ... })` is called
- **THEN** the idempotency guard uses 60_000ms as the stale pending threshold

#### Scenario: Consumer uses default timeout
- **WHEN** `createSyncServer({ db, ... })` is called without `pendingTimeoutMs`
- **THEN** the idempotency guard uses the default 30_000ms
