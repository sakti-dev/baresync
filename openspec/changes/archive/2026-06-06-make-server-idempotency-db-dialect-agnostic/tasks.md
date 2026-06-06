## 1. Refactor Server Idempotency Types

- [x] 1.1 In `packages/baresync/src/server/idempotency.ts`, remove the `SqliteRemoteDatabase` import from `drizzle-orm/sqlite-proxy` and introduce a dialect-agnostic transaction-capable DB type. Suggested starting point:

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

- [x] 1.2 Update private idempotency helpers in `idempotency.ts` (`loadPushBatchResponse`, `reservePushBatchResponse`, `finalizePushBatchResponse`) to use the inferred transaction type or a minimal private transaction interface. Keep all existing load -> reserve -> execute -> finalize behavior unchanged.

- [x] 1.3 Update `createIdempotencyGuard` to be generic over `TDb extends SyncIdempotencyDatabase` and accept `{ db }: { db: TDb }`. If TypeScript cannot cleanly express Drizzle's overloaded transaction type, keep the unavoidable cast inside `idempotency.ts`, not in route code.

- [x] 1.4 Update `cleanupSyncBatchRequests` only if required by the shared type change. If it can stay behaviorally unchanged without leaking `SqliteRemoteDatabase` to consumer route code, keep the cleanup refactor minimal.

## 2. Refactor Push Handler Option Types

- [x] 2.1 In `packages/baresync/src/server/handlers.ts`, remove the `SqliteRemoteDatabase` import and import the new `SyncIdempotencyDatabase` type from `./idempotency.js`.

- [x] 2.2 Change `SyncPushHandlerBase` so `idempotency.db` uses the new dialect-agnostic DB contract instead of `SqliteRemoteDatabase`. Preserve the existing `createSyncPushHandler({ idempotency, resolveScope, upsertOrder, applyPushChanges })` call shape.

- [x] 2.3 If useful for inference, make `SyncPushHandlerOptions` generic over the idempotency DB type with a default:

```ts
export type SyncPushHandlerOptions<
  TContext,
  TScope,
  TDb extends SyncIdempotencyDatabase = SyncIdempotencyDatabase,
> = SyncPushHandlerBase<TContext, TScope, TDb>;
```

- [x] 2.4 Ensure `packages/baresync/src/server/index.ts` exports any new public idempotency DB type only if route authors or custom adapters need to name it. Prefer exporting `type SyncIdempotencyDatabase` if it makes tests or examples clearer.

## 3. Remove Consumer Route Casts

- [x] 3.1 Update `examples/inventory-json-polling/apps/server/src/v1/routes.ts` to remove `import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy"` and remove the `idempotencyDb` cast variable. The push handler should use:

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

- [x] 3.2 Update `packages/create-baresync/src/templates/server/src/v1/routes-hono.ts` with the same direct `idempotency: { db }` usage and remove the `SqliteRemoteDatabase` import.

- [x] 3.3 Update `packages/create-baresync/src/templates/server/src/v1/routes-elysia.ts` with the same direct `idempotency: { db }` usage and remove the `SqliteRemoteDatabase` import.

- [x] 3.4 Update checked-in generated snapshots that mirror the scaffold, including `docs/external/new-hono/apps/server/src/v1/routes.ts`, so they no longer contain `SqliteRemoteDatabase`, `sqlite-proxy`, or an idempotency cast.

## 4. Update Tests

- [x] 4.1 Update `packages/baresync/src/server/__test__/handlers.test.ts`, `packages/baresync/src/server/__test__/server.test.ts`, and `packages/baresync/src/server/__test__/simulation.test.ts` so test DB helpers no longer return `SqliteRemoteDatabase` or import `drizzle-orm/sqlite-proxy`.

- [x] 4.2 Add or update a server type-oriented test that creates a SQLite Drizzle test DB and passes it directly to `createSyncPushHandler({ idempotency: { db }, ... })` without a cast.

- [x] 4.3 Add generator test assertions in `packages/create-baresync/src/__test__/integration-templates.test.ts` or `packages/create-baresync/src/__test__/templates.test.ts` that generated Hono and Elysia routes contain `idempotency: { db }` and do not contain `SqliteRemoteDatabase` or `sqlite-proxy`.

- [x] 4.4 Add an inventory/example assertion if there is already an appropriate test location; otherwise rely on typecheck plus a source search to verify the canonical route has no SQLite proxy cast.

## 5. Documentation And Spec Alignment

- [x] 5.1 Update any docs or skill references that currently show `idempotency: { db }` with an implicit SQLite-specific type assumption so they describe direct DB passing accurately.

- [x] 5.2 Do not add Postgres/MySQL scaffold instructions beyond a short note that advanced users can swap the server DB client, schema, and Drizzle dialect themselves.

- [x] 5.3 Confirm `packages/create-baresync/src/templates/server/package.json` continues to include the SQLite runtime and type dependencies needed by the default scaffold: `better-sqlite3`, `drizzle-orm`, `@types/better-sqlite3`, and `@types/node`.

## 6. Verification

- [x] 6.1 Run `bun test packages/baresync/src/server/__test__` and fix any behavior or type regressions.

- [x] 6.2 Run `bun test packages/create-baresync/src/__test__` and ensure all generator tests pass.

- [x] 6.3 Run `bun x ultracite check`. If it reports safe formatting or lint fixes, run `bun x ultracite fix`, then rerun `bun x ultracite check`.

- [x] 6.4 Run `bun run typecheck`.

- [x] 6.5 Always run the create package build: `bun run build --cwd packages/create-baresync`.

- [x] 6.6 Run `bunx fallow dead-code --format json --quiet --explain || true` and verify `total_issues` remains `0`.

- [x] 6.7 Run a final source search:

```bash
rg -n "SqliteRemoteDatabase|sqlite-proxy|idempotencyDb" \
  packages/baresync/src/server \
  packages/create-baresync/src/templates/server/src/v1 \
  examples/inventory-json-polling/apps/server/src/v1 \
  docs/external/new-hono/apps/server/src/v1
```

The expected result is no consumer route template/example matches. Internal test matches are acceptable only if they are intentionally testing compatibility and do not require route-level casts.
