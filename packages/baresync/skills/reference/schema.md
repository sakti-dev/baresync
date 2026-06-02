# Schema

How to add, remove, or modify synced tables.

## Table types

| Type | Defined in | Contract needed? |
|------|-----------|-----------------|
| **Synced** | `api-synced-schema.ts` + `local-synced-schema.ts` + `sync.config.ts` | Yes |
| **Local-only** | `local-schema.ts` | No |
| **Server-only** | `api-schema.ts` | No |

The rest of this reference is about **synced tables**.

## Paired schemas

Every synced table exists in two files with same name + business columns, different sync metadata:

```ts
// api-synced-schema.ts (server)
export const lists = sqliteTable("lists", {
  id: text("id").primaryKey(),
  scopeId: text("scope_id").notNull(),
  name: text("name").notNull(),
  ...apiSyncColumns(),  // syncUpdatedAt, deletedAt, createdAt, updatedAt
});

// local-synced-schema.ts (client)
export const lists = sqliteTable("lists", {
  id: text("id").primaryKey(),
  scopeId: text("scope_id").notNull(),
  name: text("name").notNull(),
  ...localSyncColumns(),  // isSynced, deletedAt, createdAt, updatedAt
});
```

Both must use the same table name and matching business columns.

## Primary key rules

- Must be a single `text("id")` column
- Composite primary keys are not supported
- Auto-increment integer keys are not supported

The generator validates these and reports errors if violated.

## Foreign key rules

- FK to another synced table: works. The generator computes upsert/delete order automatically.
- FK to a **non-synced** table with `NOT NULL`: generator error. Either add the referenced table to the sync contract or make the FK nullable.
- FK to a non-synced table with nullable: works, but the referenced table is not managed by sync.

## Recommended indexes

The API schema should have a composite index on `(scopeId, syncUpdatedAt)` for efficient incremental pull queries:

```ts
export const locations = sqliteTable(
  "locations",
  {
    id: text("id").primaryKey(),
    scopeId: text("scope_id").notNull(),
    name: text("name").notNull(),
    ...apiSyncColumns(),
  },
  (table) => [
    index("locations_scope_sync_idx").on(table.scopeId, table.syncUpdatedAt),
  ]
);
```

The generator warns if this index is missing but does not create it automatically.

## What localSyncColumns() and apiSyncColumns() add

**`localSyncColumns()`** — adds to local synced tables:

| Column | Type | Default | Purpose |
|---|---|---|---|
| `deletedAt` | `text` nullable | `null` | Soft-delete timestamp |
| `isSynced` | `integer` (boolean) | `false` | Dirty tracking — set to `true` after successful push |
| `createdAt` | `text` | current ISO string | Auto-set via `$defaultFn` |
| `updatedAt` | `text` | current ISO string | Auto-set via `$defaultFn` |

**`apiSyncColumns()`** — adds to server synced tables:

| Column | Type | Purpose |
|---|---|---|
| `deletedAt` | `text` nullable | Soft-delete timestamp |
| `syncUpdatedAt` | `integer` | Cursor watermark — set to `Date.now()` on write, used for incremental pull |
| `createdAt` | `text` | Row creation timestamp |
| `updatedAt` | `text` | Row modification timestamp |

Note: `syncUpdatedAt` is a server-only column. The generator marks it as `serverOnlyColumn` in the contract.

## One-side-only columns

Columns that only exist on one side:

```ts
tables: {
  lists: {
    scopeColumn: "scope_id",
    localOnlyColumns: ["draftNote"],
    serverOnlyColumns: ["auditVersion"],
  },
},
```

The generator validates that every column is accounted for — present on both sides or declared as one-side-only.

## Full update flow

### 1. Edit source schemas

Add/change tables in both `api-synced-schema.ts` and `local-synced-schema.ts`.

### 2. Update `sync.config.ts`

Add new tables to the `tables` map:

```ts
tables: {
  lists: { scopeColumn: "scope_id" },
  todos: { scopeColumn: "scope_id" },
  notes: { scopeColumn: "scope_id" },  // new
},
```

### 3. Regenerate sync contract

```bash
bun run generate:sync
```

Creates new `generated/<YYYY-MM-DD>/` directory.

### 4. Update imports

Files that import from generated schemas need the new date path:

```ts
// Before
import { lists, todos } from "@sync-contract/generated/2026-06-01/api-synced-schema";
// After
import { lists, todos, notes } from "@sync-contract/generated/2026-06-02/api-synced-schema";
```

Typically:
- Server sync repository — imports tables for query builders
- `lib.rs` — update `include_str!` path to the new contract JSON

### 5. Update TABLE registry

Wherever your client db helper registers tables, add the new ones:

```ts
import { lists, todos, notes } from "@sync-contract/local-synced-schema";
export const TABLE = { lists, todos, notes, syncCursors, syncOutbox };
```

### 6. Regenerate migrations

```bash
bun run migrate:local && bun run migrate:server
```

### 7. Update server sync repository

Add entry in `sync-repository.ts` with all 5 functions (`buildRow`, `readLatestRow`, `readRows`, `softDeleteRow`, `upsertRow`). See [server reference](server.md).

## Quick reference

```bash
bun run generate:sync                              # 1. regenerate contract
# Update include_str! path in lib.rs               # 2. point plugin to new contract
# Update server imports to new generated date      # 3. server uses snapshotted schema
# Add new tables to TABLE in db helper             # 4. app TABLE registry
# Add new tables to sync-repository                # 5. server sync handlers
bun run migrate:local && bun run migrate:server    # 6. regenerate migrations
```

See [generator reference](generator.md) for full CLI options, generated file structure, and `defineSyncConfig` parameters.

## Why frozen snapshots

Generated schemas are date-stamped and immutable. If you edit source files without regenerating, the server keeps working against the old contract. The plugin embeds the contract at compile time via `include_str!`, so it also uses the versioned snapshot.

## Production schema changes

For how schema changes affect sync in production (add/remove column, rename, type change), see [reference/production.md](production.md) — schema changes in production section.
