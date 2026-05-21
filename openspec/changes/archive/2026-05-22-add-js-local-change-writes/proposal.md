## Why

Local app writes currently require consumers to remember how to insert matching `sync_outbox` rows themselves. That is easy to get wrong and can orphan local data if the row mutation commits but the outbox enqueue does not.

## What Changes

- Add JS client helpers for safe local write flows:
  - `writeTransaction(db, callback)` to make the transaction boundary explicit and owned by the Baresync client.
  - `writeLocalChange(tx, options)` for single-row mutations that should enqueue exactly one outbox entry.
  - `enqueueChange(tx, options)` as the lower-level primitive for bulk or custom mutation flows.
- Derive sync bookkeeping from stable inputs:
  - derive `tableName` from the Drizzle table object.
  - derive `scopeId` from `createSyncClient` config.
  - generate `changedAt` internally.
- Document the bulk-update trap: `writeLocalChange` is only for single-row writes; bulk writes MUST use `enqueueChange` once per affected row inside the same `writeTransaction`.
- Update the inventory example to demonstrate transaction-scoped local writes instead of direct `syncOutbox` inserts in app code.
- Add tests first for command shape, transaction behavior, outbox rows, and bulk-safe escape hatch behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `js-sync-client`: Add transaction-scoped local write helpers to the JS sync client.
- `inventory-example`: Demonstrate safe local write + outbox enqueue usage through the public JS client helpers.
- `local-database`: Clarify that Drizzle sqlite-proxy transaction support is part of the supported local write path.

## Impact

- Affected packages:
  - `packages/baresync/src/tauri/client.ts`
  - `packages/baresync/src/tauri/__test__/client.test.ts`
  - `packages/baresync/src/db/drizzle-proxy.ts` if extra exported types are needed
- Affected example:
  - `examples/inventory-json-polling/apps/app/src/inventoryWrites.ts`
  - `examples/inventory-json-polling/apps/app/src/hooks/useSyncClient.tsx`
  - inventory app tests and docs
- No breaking API changes. Existing sync methods remain unchanged.
