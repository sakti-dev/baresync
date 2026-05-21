## 1. Test First

- [x] 1.1 Add failing JS client tests for `writeTransaction` resolving callback results and calling the provided database transaction.
- [x] 1.2 Add failing JS client tests for `writeTransaction` propagating callback errors.
- [x] 1.3 Add failing JS client tests for `enqueueChange` deriving table name, configured scope id, changed timestamp, and outbox id.
- [x] 1.4 Add failing JS client tests for `writeLocalChange` running the provided single-row write and then enqueueing one outbox row.
- [x] 1.5 Add failing JS client test or example test documenting that bulk flows call `enqueueChange` once per affected row rather than relying on `writeLocalChange`.

## 2. JS Client Implementation

- [x] 2.1 Add structural TypeScript types for Drizzle transaction/database objects accepted by the helpers.
- [x] 2.2 Implement table-name derivation from Drizzle table metadata.
- [x] 2.3 Implement `enqueueChange(tx, options)` on the sync client.
- [x] 2.4 Implement `writeLocalChange(tx, options)` on the sync client.
- [x] 2.5 Implement `writeTransaction(db, callback)` on the sync client.
- [x] 2.6 Export helper option types as needed without exposing internal sync bookkeeping fields in the common API.

## 3. Inventory Example Integration

- [x] 3.1 Refactor inventory `createSampleInventoryRows` to use `client.writeTransaction` and `client.writeLocalChange`.
- [x] 3.2 Refactor inventory `softDeleteInventoryRow` to use `client.writeTransaction` and `client.writeLocalChange` with operation `"update"`.
- [x] 3.3 Remove direct `syncOutbox` insertion from the inventory app domain write helper.
- [x] 3.4 Update React call sites and hooks so the sync client is available where domain writes need it.
- [x] 3.5 Update inventory docs or UI copy to describe transaction-scoped local writes.

## 4. Verification

- [x] 4.1 Run the targeted JS client tests and confirm the new tests pass after implementation.
- [x] 4.2 Run the inventory app tests.
- [x] 4.3 Run `bun x ultracite check`.
- [x] 4.4 Run `bun run typecheck`.
- [x] 4.5 Run relevant inventory package typechecks.
