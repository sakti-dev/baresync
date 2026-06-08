## ADDED Requirements

### Requirement: Grouped sync server factory

The `baresync/server` export path SHALL provide a `createSyncServer` factory for batteries-included server route bundles. The factory SHALL accept one parent options object containing `db`, `resolveScope`, `push`, `pull`, and `status`, and SHALL return an object containing `push`, `pull`, and `status` handlers.

Each returned handler SHALL accept a Web `Request` and app-defined context and resolve to a Web `Response`. The returned handlers SHALL NOT require Hono, Elysia, Next, Bun, Workers, or any other framework-specific request type.

#### Scenario: Grouped server exposes three handlers

- **WHEN** a consumer imports `createSyncServer` from `baresync/server`
- **AND** creates a server with `db`, `resolveScope`, `push`, `pull`, and `status` options
- **THEN** the returned value SHALL expose callable `push`, `pull`, and `status` handler functions
- **AND** each handler SHALL accept `(request, context)` arguments
- **AND** each handler SHALL return a Web `Response`

#### Scenario: Grouped push uses parent idempotency database

- **WHEN** a grouped sync server receives a valid push request with `clientId`, `idempotencyKey`, `scopeId`, and table changes
- **THEN** the push handler SHALL run idempotency through the parent `db`
- **AND** a second push request with the same `clientId`, `idempotencyKey`, and request hash SHALL replay the cached response
- **AND** the `applyPushChanges` callback SHALL NOT run again for the replayed request

#### Scenario: Grouped pull passes configured limit

- **WHEN** a grouped sync server receives a valid pull request
- **THEN** the pull handler SHALL call `loadPullChanges` with the `pull.limit` value from the grouped options
- **AND** it SHALL pass the resolved scope, raw scope ID, cursor, requested tables, context, and request

#### Scenario: Grouped status uses shared scope resolver

- **WHEN** a grouped sync server receives a valid status request
- **THEN** the status handler SHALL call the parent `resolveScope`
- **AND** it SHALL call `loadSyncStatus` only after scope resolution succeeds

#### Scenario: Grouped handlers stop on denied scope

- **WHEN** the parent `resolveScope` returns `{ ok: false, status, body }` for push, pull, or status
- **THEN** the corresponding grouped handler SHALL return a `Response` with that status and body
- **AND** the operation callback (`applyPushChanges`, `loadPullChanges`, or `loadSyncStatus`) SHALL NOT be called

### Requirement: Grouped server public types

The `baresync/server` export path SHALL export `SyncServerOptions` and `SyncServer` types for the grouped server factory. `SyncServerOptions` SHALL allow the parent `db` value to satisfy the existing `SyncIdempotencyDatabase` contract without forcing route modules to import or cast `SqliteRemoteDatabase`.

#### Scenario: Consumer imports grouped server types

- **WHEN** a TypeScript consumer imports `createSyncServer`, `type SyncServer`, and `type SyncServerOptions` from `baresync/server`
- **THEN** TypeScript SHALL resolve those exports
- **AND** a direct Drizzle database satisfying `SyncIdempotencyDatabase` SHALL be accepted as the parent `db`

#### Scenario: Push options omit nested idempotency

- **WHEN** a consumer configures `createSyncServer`
- **THEN** the `push` options SHALL include `upsertOrder` and `applyPushChanges`
- **AND** the `push` options SHALL NOT require or accept `idempotency`
- **AND** the `push` options SHALL NOT require or accept `resolveScope`

