# Server

How to set up server routes, sync repository, and scope resolution.

If the exact handler behavior is unclear, load `reference/source.md` and inspect the mapped workspace source.

## Three files

| File | Purpose |
|------|---------|
| `apps/server/src/db/client.ts` | Opens the default scaffold server database connection |
| `apps/server/src/db/v1/sync-repository.ts` | Per-table CRUD for sync |
| `apps/server/src/v1/routes.ts` | `/api/v1/sync/{push,pull,status}` handlers |

## Database connection

`db/client.ts` opens `better-sqlite3` and exports a Drizzle instance in the default scaffold:

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
export const db = drizzle(sqlite);
```

Override path with `MY_APP_SERVER_DB_PATH` env var. For Postgres/MySQL/libSQL, replace the driver.

The idempotency guard is transactionless and dialect-agnostic: `createSyncServer` only needs a Drizzle database at the top level `db` option. It works with SQLite, Postgres, MySQL, libSQL (Turso), and other Drizzle-supported backends without requiring interactive transaction support.

## Sync repository

`sync-repository.ts` wraps `createDrizzleSyncRepository` with one entry per synced table. Each entry has 5 functions:

```ts
import { createDrizzleSyncRepository } from "baresync/server/drizzle";

export function createAppSyncRepository(db) {
  const repository = createDrizzleSyncRepository({
    tables: {
      lists: {
        buildRow: ({ row, scopeId, syncUpdatedAt, updatedAt }) => ({
          id: requiredString(row.id, "lists.id"),
          name: requiredString(row.name, "lists.name"),
          scopeId,
          syncUpdatedAt,
          updatedAt,
          // ... other columns
        }),
        readLatestRow: async ({ scopeId }) => { /* most recent row */ },
        readRows: ({ cursorTimestamp, scopeId }) => { /* rows since cursor */ },
        softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => { /* mark deleted */ },
        upsertRow: async (row) => { /* insert or update */ },
      },
    },
  });

  return {
    tableNames: repository.tableNames,
    applyPushChanges: repository.applyPushChanges,
    loadPullChanges: repository.loadPullChanges,
    loadSyncStatus: repository.loadSyncStatus,
  };
}
```

### The 5 functions

- **`buildRow`** — constructs API row from raw push payload. Use `requiredString`/`optionalString` for validation.
- **`readLatestRow`** — returns most recently updated row for cursor calculation.
- **`readRows`** — returns all rows changed since a cursor timestamp. Filter by `scopeId` and `syncUpdatedAt > cursorTimestamp`.
- **`softDeleteRow`** — sets `deletedAt` and `syncUpdatedAt` on a row.
- **`upsertRow`** — `INSERT ... ON CONFLICT DO UPDATE`.

## Route handlers

`routes.ts` wires all three endpoints with a single grouped server:

```ts
import { createSyncServer } from "baresync/server";

const syncServer = createSyncServer({
  db,
  resolveScope,
  push: {
    upsertOrder: repository.tableNames,
    applyPushChanges: async ({ changes, scope, syncUpdatedAt }) =>
      repository.applyPushChanges({ changes, scopeId: scope.scopeId, syncUpdatedAt }),
  },
  pull: {
    limit: 1000,
    loadPullChanges: async ({ cursor, scope, tables }) =>
      repository.loadPullChanges({ cursor, scopeId: scope.scopeId, tables }),
  },
  status: {
    loadSyncStatus: async ({ cursor, scope }) =>
      repository.loadSyncStatus({ cursor, scopeId: scope.scopeId }),
  },
});
```

Pass the raw Web `Request` directly to `syncServer.push`, `syncServer.pull`, and `syncServer.status`. Do not reconstruct `Request` objects from parsed bodies. Push idempotency hashes the raw request bytes, so framework body parsing before Baresync reads the request can break conflict detection.

Mount in Hono:

```ts
const sync = new Hono();
sync.post("/push", (c) => syncServer.push(c.req.raw, {}));
sync.post("/pull", (c) => syncServer.pull(c.req.raw, {}));
sync.post("/status", (c) => syncServer.status(c.req.raw, {}));
export default sync;
```

For Elysia, pass the original `request` directly and use `{ parse: "none" }` to prevent body parsing before Baresync reads the request:

```ts
app.post("/push", ({ request }) => syncServer.push(request, {}), { parse: "none" });
app.post("/pull", ({ request }) => syncServer.pull(request, {}));
app.post("/status", ({ request }) => syncServer.status(request, {}));
```

That `db` can come from SQLite, Postgres, MySQL, or libSQL as long as the database implementation supports the operations the idempotency guard uses.

## Scope resolution

`resolveScope` is called on every request. Replace the scaffold's default with your auth check:

```ts
const resolveScope = async ({ scopeId }: { scopeId: string }) => {
  const user = await getUserFromSession(request);
  if (!user || !user.scopes.includes(scopeId)) {
    return { ok: false as const, status: 403, body: { error: "forbidden" } };
  }
  return { ok: true as const, scope: { scopeId } };
};
```

If it returns `{ ok: false }`, the handler returns that response immediately — no database access.

## Adding a new synced table

1. Add entry to `sync-repository.ts` with all 5 functions
2. Import the table from `@sync-contract/generated/<date>/api-synced-schema`
3. The `upsertOrder` is automatically handled by `repository.tableNames`

## Status handler

The status handler answers: "Has anything changed since this cursor?" The sync engine calls this before every sync cycle to decide whether to pull. With `createSyncServer`, the same `resolveScope` and `loadSyncStatus` callback are shared with the grouped server bundle.

### How the engine uses this

When `sync_now()` runs:

1. Calls `getState()` to check `local_dirty_count`
2. Calls `/status` to check `hasChanges`
3. Decides the mode:
   - `local_dirty_count === 0 && !hasChanges` → NoOp
   - `local_dirty_count > 0 && !hasChanges` → PushOnly
   - `local_dirty_count === 0 && hasChanges` → PullOnly
   - Both → FullSync

### Callback inputs

All three callbacks (`applyPushChanges`, `loadPullChanges`, `loadSyncStatus`) receive:

| Input | Description |
|---|---|
| `context` | Second argument to the handler (`{}` by default) |
| `request` | Raw `Request` object |
| `scope` | Resolved scope from `resolveScope` |
| `scopeId` | Raw scope ID string |

`applyPushChanges` additionally receives: `changes`, `clientId`, `idempotencyKey`, `requestHash`, `syncUpdatedAt`.

`loadPullChanges` additionally receives: `cursor`, `limit`, `tables`.

## Context parameter

The second argument to every handler is passed as `context` to all callbacks. Use it for request-scoped data:

```ts
app.post("/push", (c) => push(c.req.raw, { userId: "123" }));
```

Then in `resolveScope`:

```ts
const resolveScope = async ({ scopeId, context }) => {
  const user = await getUser(context.userId);
  // ...
};
```

## Error mapping

The `mapSyncError` function maps errors by type:

1. `SyncPayloadTooLargeError` → `sync_payload_too_large` (413)
2. Error with `status: 409` → `sync_idempotency_conflict` (409)
3. Error with `status: 401` → `sync_unauthorized` (401)
4. Error with `status: 413` → `sync_payload_too_large` (413)
5. Error with `status: 403` or `404` → `sync_scope_invalid` (403)
6. Error with `status: 400` → `sync_cursor_invalid` (400)
7. `TypeError` → `sync_network_error` (500)
8. Everything else → `sync_unknown` (500)

HTTP status comes from the error's `status` property if present, otherwise the code's default.

## Throwing from callbacks

Your callbacks can throw:

- Objects with a `status` property — used for HTTP status
- `Error` instances — `error.message` is preserved
- Anything else — `String(error)`

The handler always catches and returns a proper error response. It never lets an unhandled exception reach the HTTP framework.

```ts
// Custom validation error
throw Object.assign(new Error("Name too long"), { status: 422 });
// Returns: { "code": "sync_unknown", "message": "Name too long" } with HTTP 422
```

## Scope resolution errors

Return `{ ok: false, status, body }` from `resolveScope` instead of throwing. The handler uses `status` for HTTP and `body` as the JSON response directly — no error mapping.

## Type safety

`createSyncServer<TContext, TScope>` is generic over `TScope`. The `scope` parameter in your callbacks is typed as `TScope`.

## Low-level primitives

For non-Drizzle servers or custom handlers, import from `baresync/server`:

```ts
import {
  changedTableNames,
  chunkArray,
  decodeSyncRequest,
  encodeSyncResponse,
  formatLatestSyncCursor,
  formatSyncCursor,
  formatSyncWatermarkCursor,
  getWriteChunkSize,
  orderDeleteChanges,
  orderPushChanges,
  parseSyncCursor,
  parseSyncCursorTimestamp,
  pickLatestSyncCursorRow,
  buildPullTables,
  splitSyncRows,
  validatePushEnvelope,
  validateSyncTable,
  ConflictRequestError,
  SAFE_SQLITE_BIND_PARAM_LIMIT,
  SyncPayloadTooLargeError,
} from "baresync/server";
```

## Mounting

`apps/server/src/index.ts`:

```ts
import sync from "./v1/routes";
const app = new Hono();
app.get("/health", (c) => c.json({ ok: true }));
app.route("/api/v1/sync", sync);
export default app;
```

## Testing

If you need to test server routes, see [reference/testing.md](testing.md) — server contract tests section covers testing handlers with real `Request` objects, authorization, and idempotency.
