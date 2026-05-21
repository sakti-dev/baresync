## Context

The JS sync client currently wraps Tauri sync commands but does not help consumers enqueue local outbox changes. The inventory example therefore needs app code that knows the `sync_outbox` schema and inserts outbox rows manually.

The correctness problem is transaction atomicity. A local row mutation and the matching outbox enqueue must commit together. If the row commits without the outbox entry, the row can remain local forever and never reach the server.

Drizzle's `sqlite-proxy` driver supports `db.transaction(...)` by issuing `BEGIN`, running the callback against a transaction object, and then `COMMIT` or `ROLLBACK`. That makes an injected transaction pattern viable without intercepting Drizzle SQL generation.

## Goals / Non-Goals

**Goals:**

- Provide a public JS API that makes atomic local writes the default documented pattern.
- Keep normal Drizzle mutation syntax for app code.
- Hide sync bookkeeping fields for common use: `tableName`, `scopeId`, `changedAt`, and outbox id.
- Support multi-row app actions by allowing several single-row changes inside one transaction.
- Provide a lower-level enqueue primitive for bulk updates where one SQL statement affects many rows.
- Update the inventory example to stop teaching direct `syncOutbox` insertion from app code.
- Follow TDD: write failing tests for transaction helpers and inventory usage before implementation.

**Non-Goals:**

- Do not implement hard-delete-first APIs in this change.
- Do not make `writeLocalChange` infer affected rows from arbitrary Drizzle `where` clauses.
- Do not change the sync protocol or server push/pull semantics.
- Do not remove the existing sync command methods from `SyncClient`.
- Do not require raw SQL for common local writes.

## Decisions

### Use `writeTransaction(db, callback)` as the transaction boundary

The client will expose a helper that accepts the consumer's Drizzle database object and runs the callback inside `db.transaction(...)`.

This keeps the sync client independent from database construction while making the safe transaction boundary obvious:

```ts
await client.writeTransaction(db, async (tx) => {
  await client.writeLocalChange(tx, {
    table: locations,
    rowId: locationId,
    operation: "insert",
    write: (tx) => tx.insert(locations).values(location),
  });
});
```

Alternative considered: make `createSyncClient` own the Drizzle database. That would reduce one argument, but it would couple the sync client factory to database construction and force a larger API reshaping.

### Keep `writeLocalChange` single-row only

`writeLocalChange(tx, options)` will run one caller-provided mutation and enqueue exactly one outbox row. It is correct for inserting one row, updating one row by id, and soft-deleting one row by id.

It MUST NOT be documented as a bulk mutation helper. Drizzle updates can affect multiple rows, but `writeLocalChange` accepts one `rowId`; pretending it handles bulk writes would create unsynced ghost rows.

Alternative considered: inspect the Drizzle mutation to determine affected ids. That is brittle, query-shape dependent, and not supported by the proxy driver contract.

### Expose `enqueueChange` as the bulk-safe primitive

`enqueueChange(tx, options)` will insert one outbox entry without running the domain mutation. Bulk flows can update many rows, query or already know affected ids, and then call `enqueueChange` once per affected row inside the same `writeTransaction`.

Example:

```ts
await client.writeTransaction(db, async (tx) => {
  const affected = await tx
    .select({ id: items.id })
    .from(items)
    .where(eq(items.locationId, locationId));

  await tx
    .update(items)
    .set({ deletedAt: timestamp, isSynced: false, updatedAt: timestamp })
    .where(eq(items.locationId, locationId));

  for (const row of affected) {
    await client.enqueueChange(tx, {
      table: items,
      rowId: row.id,
      operation: "update",
    });
  }
});
```

### Derive bookkeeping internally

The helpers will derive:

- `tableName` from the Drizzle table using Drizzle table metadata.
- `scopeId` from `createSyncClient({ scopeId })`.
- `changedAt` from the current time.
- outbox id from operation, table name, row id, and a unique suffix.

The common API will not accept `tableName`, `scopeId`, or `changedAt`. This reduces schema drift and consumer mistakes.

### Limit documented example operations to insert/update

The inventory example uses soft deletes, so it will enqueue soft-delete changes as `operation: "update"`. The core supports `"delete"` for hard-delete tombstone flows, but this change will not teach that path.

## Risks / Trade-offs

- Bulk update misuse → Mitigation: specs and docs MUST state that `writeLocalChange` is single-row only and bulk flows MUST call `enqueueChange` per affected row.
- Transaction helper type complexity → Mitigation: keep type definitions minimal and structural, with tests proving the intended call shape rather than overfitting Drizzle internals.
- Outbox id collisions → Mitigation: include a unique suffix or UUID in generated outbox ids.
- Separate `db` argument feels repetitive → Mitigation: keep it for now to avoid coupling client creation to database creation; consider a combined factory later.
- A row mutation can still omit `isSynced: false` → Mitigation: document this as part of app mutation responsibility for now; automatic row-state mutation is out of scope for this change.

## Migration Plan

No breaking migration is required.

Implementation can land additively:

1. Add failing JS client tests for the new APIs.
2. Implement `writeTransaction`, `writeLocalChange`, and `enqueueChange`.
3. Update the inventory example to use the helpers.
4. Update docs to show the transaction-scoped local write pattern and the bulk-update escape hatch.

Rollback is to keep direct `syncOutbox` insertion in the inventory example and leave new helpers unused; existing sync APIs remain unchanged.
