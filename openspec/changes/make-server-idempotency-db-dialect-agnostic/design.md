## Context

The current server push path works at runtime with the SQLite-backed Drizzle DB used by the scaffold and inventory example, but its TypeScript surface is SQLite-specific. `packages/baresync/src/server/handlers.ts` and `packages/baresync/src/server/idempotency.ts` import `SqliteRemoteDatabase` from `drizzle-orm/sqlite-proxy`, and generated route modules must cast the local server DB through that type before passing it to `idempotency: { db }`.

That type coupling is misleading. The idempotency guard does not need a remote SQLite proxy. It needs a database object with `transaction(callback)` where the callback receives a Drizzle transaction that supports the query operations used against `sync_batch_requests`.

The scaffold should stay SQLite-first. This change only removes the SQLite-specific type from the route and handler contract so future Postgres/MySQL server backends can use the same API-side route shape.

## Goals / Non-Goals

**Goals:**

- Let API-side route code pass `idempotency: { db }` directly.
- Remove `SqliteRemoteDatabase` imports and casts from generated Hono/Elysia routes and the inventory example route.
- Keep the existing SQLite `better-sqlite3` scaffold as the default.
- Preserve idempotency behavior: first push reserves and finalizes, duplicate push replays, conflicts return 409, cleanup still operates on `sync_batch_requests`.
- Keep the public `createSyncPushHandler` call shape stable for normal users while widening the accepted `idempotency.db` type.
- Add enough tests to catch regressions in handler types, scaffold route output, and example route usage.

**Non-Goals:**

- Do not add a Postgres, MySQL, or CockroachDB scaffold option.
- Do not generate `pgTable` or `mysqlTable` schemas.
- Do not change the local Tauri SQLite DB path.
- Do not redesign the Drizzle repository helper.
- Do not change wire protocol, request/response JSON, chunking, cursor format, or sync semantics.

## Decisions

### Define a small transaction-capable DB contract

Introduce a server-side type in `packages/baresync/src/server/idempotency.ts` or a nearby internal module:

```ts
type Awaitable<T> = T | Promise<T>;

export interface SyncIdempotencyDatabase<TTransaction = unknown> {
  transaction<TResult>(
    callback: (tx: TTransaction) => Awaitable<TResult>
  ): Promise<TResult>;
}

export type SyncIdempotencyTransaction<TDb> =
  TDb extends SyncIdempotencyDatabase<infer TTransaction>
    ? TTransaction
    : never;
```

This models the only DB feature the guard owns: transaction execution. It also lets TypeScript infer the concrete transaction type for Drizzle SQLite, Postgres, or MySQL DB instances.

Alternative considered: keep `SqliteRemoteDatabase` and hide the cast in scaffolds. That keeps compiling but leaves an inaccurate public type and makes future dialect support look accidental.

### Make idempotency helper functions generic over the transaction

Change helpers in `idempotency.ts` from a `SqliteRemoteDatabase`-derived `DbLike` to a generic transaction type:

```ts
type IdempotencyTx = {
  select: unknown;
  insert: unknown;
  update: unknown;
  delete: unknown;
};
```

The exact implementation should preserve useful query typing where feasible. A pragmatic route is to infer the transaction from `SyncIdempotencyDatabase` and type the private helpers using that inferred transaction:

```ts
export function createIdempotencyGuard<
  TDb extends SyncIdempotencyDatabase,
>({ db }: { db: TDb }) {
  type Tx = SyncIdempotencyTransaction<TDb>;

  return {
    run<T>(params: GuardParams, callback: () => Promise<T>) {
      return db.transaction(async (tx) => {
        const existing = await loadPushBatchResponse(tx as Tx, params);
        // existing load -> reserve -> callback -> finalize flow
      });
    },
  };
}
```

If Drizzle's overloaded transaction types do not infer cleanly, define the smallest private transaction interface with the methods used by this file and cast once inside `createIdempotencyGuard`. That cast belongs in Baresync internals, not in user route code.

### Widen push handler options without changing route shape

Change `SyncPushHandlerBase` in `handlers.ts` from:

```ts
idempotency: {
  db: SqliteRemoteDatabase;
};
```

to:

```ts
idempotency: {
  db: SyncIdempotencyDatabase;
};
```

or make `SyncPushHandlerOptions` generic over the DB:

```ts
interface SyncPushHandlerBase<TContext, TScope, TDb extends SyncIdempotencyDatabase> {
  idempotency: { db: TDb };
  // existing callbacks unchanged
}

export type SyncPushHandlerOptions<
  TContext,
  TScope,
  TDb extends SyncIdempotencyDatabase = SyncIdempotencyDatabase,
> = SyncPushHandlerBase<TContext, TScope, TDb>;
```

The implementation of `createSyncPushHandler` should pass `options.idempotency` to `createIdempotencyGuard` as it does today.

### Keep route usage dialect-neutral

Generated route templates and the inventory example should become:

```ts
const push = createSyncPushHandler({
  idempotency: { db },
  resolveScope,
  upsertOrder: repository.tableNames,
  applyPushChanges: async ({ changes, scope, syncUpdatedAt }) =>
    repository.applyPushChanges({
      changes,
      scopeId: scope.scopeId,
      syncUpdatedAt,
    }),
});
```

There should be no import from `drizzle-orm/sqlite-proxy` in:

- `packages/create-baresync/src/templates/server/src/v1/routes-hono.ts`
- `packages/create-baresync/src/templates/server/src/v1/routes-elysia.ts`
- `examples/inventory-json-polling/apps/server/src/v1/routes.ts`
- checked-in generated snapshots such as `docs/external/new-hono/apps/server/src/v1/routes.ts`

### Keep SQLite scaffold defaults

Leave the generated server DB client as SQLite:

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite);
```

The scaffold should keep `better-sqlite3`, `drizzle-orm`, `@types/better-sqlite3`, and `@types/node` dependencies that were added for the generated server to compile.

### Document future backend shape without implementing it

The design should leave an obvious route for advanced users:

```ts
// Postgres example shape, documentation only for now
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.MY_APP_SERVER_DATABASE_URL,
});

export const db = drizzle(pool);
```

The same route module should still call `idempotency: { db }`. Dialect-specific schema generation is intentionally out of scope for this change.

## Risks / Trade-offs

- Drizzle transaction types differ by driver -> keep the public idempotency DB contract narrow and move any unavoidable cast into `idempotency.ts`.
- Over-generalizing the DB type can hide runtime incompatibility -> tests must still exercise SQLite behavior through the real current test DB fixtures.
- Postgres/MySQL may need dialect-specific schema/table definitions later -> explicitly keep that as a future server schema feature, not part of this typing refactor.
- Existing users who imported `SyncPushHandlerOptions` with an explicit SQLite type may see a type widening -> expected to be source-compatible for normal route usage.

## Migration Plan

1. Add the generic idempotency DB types and update `createIdempotencyGuard`.
2. Update `createSyncPushHandler` option types to use the generic idempotency DB contract.
3. Remove route-level `SqliteRemoteDatabase` imports and casts from templates, examples, and generated snapshots.
4. Update tests and docs/spec references.
5. Run verification:

```bash
bun test packages/baresync/src/server/__test__
bun test packages/create-baresync/src/__test__
bun x ultracite check
bun run typecheck
bun run build --cwd packages/create-baresync
bunx fallow dead-code --format json --quiet --explain
```

Rollback is straightforward: restore the previous `SqliteRemoteDatabase` type in `handlers.ts` and `idempotency.ts`, then restore route casts. No data migration is involved.

## Open Questions

- Should `SyncIdempotencyDatabase` be exported from `baresync/server` for users who want to type custom adapters explicitly, or kept internal until a non-SQLite backend is documented?
- Should cleanup helpers such as `cleanupSyncBatchRequests` use the same generic DB contract in this change, or stay typed to the current Drizzle shape until a real non-SQLite server backend exists?
