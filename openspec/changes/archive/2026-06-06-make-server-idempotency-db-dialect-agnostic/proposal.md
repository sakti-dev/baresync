## Why

The server push/idempotency path currently leaks `SqliteRemoteDatabase` from `drizzle-orm/sqlite-proxy` into API route code, even though the API side only needs an idempotency store that can run transactional reads and writes. This makes the default SQLite scaffold compile only after a confusing cast and makes future server backends such as Postgres or MySQL look harder than they need to be.

## What Changes

- Replace SQLite-specific idempotency database typing in the server handler and idempotency guard with a dialect-agnostic transaction-capable database contract.
- Keep the generated scaffold default on SQLite with `better-sqlite3`.
- Remove `SqliteRemoteDatabase` imports and casts from the generated Hono/Elysia route templates, the canonical inventory example, and generated snapshot routes.
- Keep `createSyncPushHandler({ idempotency: { db }, ... })` as the public route-level usage for SQLite while allowing compatible Drizzle Postgres/MySQL database instances to use the same route shape.
- Add or update tests so the handler, idempotency guard, scaffolder, and inventory example prove that the SQLite-specific type no longer appears in consumer-facing API route code.
- Do not add a Postgres or MySQL scaffold option in this change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `server-idempotency`: the idempotency guard shall accept a dialect-agnostic transaction-capable database instead of a SQLite-specific Drizzle type.
- `server-handler-helpers`: the push handler options shall accept the same dialect-agnostic idempotency database contract and shall not require consumer routes to import `drizzle-orm/sqlite-proxy`.
- `project-scaffolder`: generated server route modules shall pass the SQLite Drizzle database directly to `idempotency: { db }` without a `SqliteRemoteDatabase` cast, while keeping SQLite as the default server backend.
- `inventory-example`: the canonical server route shall demonstrate the direct `idempotency: { db }` API-side usage without a SQLite proxy cast.

## Impact

- Affected package code: `packages/baresync/src/server/handlers.ts`, `packages/baresync/src/server/idempotency.ts`, `packages/baresync/src/server/index.ts`, and server tests under `packages/baresync/src/server/__test__`.
- Affected scaffold code: `packages/create-baresync/src/templates/server/src/v1/routes-hono.ts`, `packages/create-baresync/src/templates/server/src/v1/routes-elysia.ts`, and generator tests.
- Affected example code: `examples/inventory-json-polling/apps/server/src/v1/routes.ts`.
- Affected generated snapshots: any checked-in external scaffold snapshots that mirror the route templates.
- Public API impact: source-compatible improvement for normal users; `createSyncPushHandler` remains the same shape at the call site, but the exported `SyncPushHandlerOptions` and `createIdempotencyGuard` option types become more general.
- Dependency impact: no new runtime dependencies are required.
