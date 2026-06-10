## Why

`enqueueChange` does a plain `INSERT` into `sync_outbox`, which crashes with a unique constraint violation when a pending entry already exists for the same `(table_name, row_id)`. This happens in production when any row is written twice before sync runs — a common pattern in apps with background processing pipelines (e.g., create asset → compress → upload, each triggering an outbox enqueue).

## What Changes

- Change `enqueueChange` from raw `INSERT` to `INSERT … ON CONFLICT DO UPDATE` with operation coalescing
- The coalescing rule: if the existing outbox operation is `"insert"`, preserve it (server never saw the row); otherwise, the new operation wins
- Scope: `"insert"` + `"update"` operations only. `"delete"` is not in the JS `LocalChangeOperation` type and is out of scope
- Widen the `SyncTransaction` interface to support `onConflictDoUpdate` chaining on the insert builder

## Capabilities

### New Capabilities

_None_

### Modified Capabilities

- `js-sync-client`: `enqueueChange` semantics change from unconditional INSERT to conditional upsert with insert-preserving coalescing

## Affected Areas

- `packages/baresync/src/tauri/client.ts` — `enqueueChange` implementation, `SyncTransaction` interface
- `packages/baresync/src/tauri/__test__/client.test.ts` — test mock and new coalescing tests

## Scope

- **In scope**: Upsering outbox entries with `insert`+`update` coalescing, interface widening, tests
- **Out of scope**: Adding `"delete"` to `LocalChangeOperation`, handling delete-related coalescing cases, changing the Rust push engine, changing the outbox schema
