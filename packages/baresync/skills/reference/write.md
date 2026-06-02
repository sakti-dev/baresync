# Write

How to create, update, and delete local data that syncs to the server.

## Core rule

**Always use `writeTransaction` + `writeLocalChange` for syncable data.** Direct Drizzle writes bypass the outbox and will not be pushed.

## Insert a row

```ts
import { db, TABLE } from "./lib/db";
import { SYNC_SCOPE } from "@sync-contract/constants";
import { useSyncClient } from "./hooks/useBaresyncQuery";

const client = useSyncClient();
const id = crypto.randomUUID();
const now = new Date().toISOString();

await client.writeTransaction(db, async (tx) => {
  await client.writeLocalChange(tx, {
    table: TABLE.lists,
    rowId: id,
    operation: "insert",
    write: (writeTx) =>
      writeTx.insert(TABLE.lists).values({
        id,
        scopeId: SYNC_SCOPE,
        name: "Groceries",
        createdAt: now,
        updatedAt: now,
      }),
  });
});
```

## Update a row

```ts
import { eq } from "drizzle-orm";

await client.writeTransaction(db, async (tx) => {
  await client.writeLocalChange(tx, {
    table: TABLE.lists,
    rowId: id,
    operation: "update",
    write: (writeTx) =>
      writeTx
        .update(TABLE.lists)
        .set({ name: "Updated", updatedAt: new Date().toISOString() })
        .where(eq(TABLE.lists.id, id)),
  });
});
```

## Soft-delete a row

Baresync uses soft deletes. Set `deletedAt` and `isSynced: false`:

```ts
await client.writeTransaction(db, async (tx) => {
  await client.writeLocalChange(tx, {
    table: TABLE.lists,
    rowId: id,
    operation: "update",
    write: (writeTx) =>
      writeTx
        .update(TABLE.lists)
        .set({
          deletedAt: new Date().toISOString(),
          isSynced: false,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(TABLE.lists.id, id)),
  });
});
```

**Never use `.delete()` on synced rows.** Hard deletes are not tracked by the outbox.

## Bulk update pattern

For updates affecting multiple rows, query affected IDs first, then enqueue one outbox entry per row:

```ts
await client.writeTransaction(db, async (tx) => {
  const rows = await tx
    .update(TABLE.todos)
    .set({ deletedAt: now, isSynced: false, updatedAt: now })
    .where(eq(TABLE.todos.listId, listId))
    .returning({ id: TABLE.todos.id });

  for (const row of rows) {
    await client.enqueueChange(tx, {
      table: TABLE.todos,
      rowId: row.id,
      operation: "update",
    });
  }
});
```

Use `enqueueChange` when the mutation is already done and you only need outbox tracking. SQLite supports `.returning()` on updates.

## How it works under the hood

`writeTransaction` opens a Drizzle transaction. Inside it, `writeLocalChange`:

1. Runs your `write` callback (the actual insert/update)
2. Inserts a row into `sync_outbox` with table name, row ID, and operation

The `sync_outbox` has a unique partial index on `(table_name, row_id) WHERE synced_at IS NULL`. Writing to the same row while a pending entry exists causes a constraint violation — catch the error or check for existing pending entries before inserting.

## What happens to outbox entries before push

When the engine pushes, it coalesces multiple outbox entries for the same row into a single operation:

| Previous | Next | Result |
|---|---|---|
| `insert` | `update` | `insert` (treat as create) |
| `insert` | `delete` | cancelled (row never existed) |
| `update` | `update` | `update` |
| `update` | `delete` | `delete` |
| `delete` | `insert` | `update` (re-create) |
| `delete` | `update` | `update` |
| `delete` | `delete` | `delete` |

The server sees the net effect, not every intermediate state. If you insert then delete a row before the next sync cycle, the server never sees it.

## Local-only columns are stripped

Columns marked as `localOnly` in `sync.config.ts` are removed before the data leaves the device. The server never receives these columns. If your server needs data that only exists locally, you'll need a different approach (e.g. a separate API endpoint).

```ts
tables: {
  items: {
    scopeColumn: "scope_id",
    localOnlyColumns: ["draftNote"], // stripped from push payload
  },
},
```

## Querying data

Use standard Drizzle queries through the proxy:

```ts
import { db, TABLE } from "./lib/db";
import { desc } from "drizzle-orm";

const lists = await db.select().from(TABLE.lists).orderBy(desc(TABLE.lists.updatedAt));
```

Wrap in React Query for cache invalidation:

```ts
const { rows, loading, error } = useDrizzleQuery(["inventory", "lists"], () =>
  db.select().from(TABLE.lists).orderBy(desc(TABLE.lists.updatedAt))
);
```

## db.batch for non-synced writes

For writes to local-only tables or bulk operations that don't need outbox tracking, use `db.batch`:

```ts
await db.batch([
  db.insert(TABLE.userPreferences).values({ id: "pref-1", theme: "dark" }),
  db.insert(TABLE.userPreferences).values({ id: "pref-2", theme: "light" }),
]);
```

All statements run in a single Rust transaction. If any fails, all roll back.

## writeTransaction vs db.batch

| Scenario | Use |
|---|---|
| Writing to synced tables | `client.writeTransaction` + `writeLocalChange` |
| Writing to local-only tables | `db.batch` or individual `db.insert`/`db.update` |
| Bulk import (no sync needed) | `db.batch` |

## Atomicity guarantees

Both `writeTransaction` and `db.batch` are atomic — all statements run in a single SQLite transaction. If any statement fails, the entire batch rolls back. No partial state is visible to other queries.

For `writeTransaction`, this means the write and the outbox entry are always together — no orphan outbox entries from partial writes.

## Testing

If you need to verify the write path (domain row + outbox row), see [reference/testing.md](testing.md) — local database tests section covers asserting both rows exist with correct scope and operation.
