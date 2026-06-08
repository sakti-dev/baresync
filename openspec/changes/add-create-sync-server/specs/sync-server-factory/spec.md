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

#### Scenario: Grouped push preserves change ordering

- **WHEN** a grouped sync server receives push table changes in a different order than `push.upsertOrder`
- **THEN** the push handler SHALL pass changes to `applyPushChanges` ordered by `push.upsertOrder`
- **AND** the response body SHALL match the encoded body returned by `applyPushChanges`

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

### Requirement: Standalone server factories remain compatible and deprecated

The existing `createSyncPushHandler`, `createSyncPullHandler`, and `createSyncStatusHandler` exports SHALL remain source-compatible during this deprecation period. Each standalone factory SHALL include JSDoc `@deprecated` guidance directing batteries-included route integrations to `createSyncServer` and custom protocol routes to the low-level primitives exported from `baresync/server`.

#### Scenario: Existing standalone push handler remains source-compatible

- **WHEN** existing code imports `createSyncPushHandler` from `baresync/server`
- **AND** creates a push handler with `resolveScope`, `upsertOrder`, `idempotency: { db }`, and `applyPushChanges`
- **THEN** the code SHALL continue to typecheck
- **AND** the handler SHALL preserve existing push behavior

#### Scenario: Existing standalone pull handler remains source-compatible

- **WHEN** existing code imports `createSyncPullHandler` from `baresync/server`
- **AND** creates a pull handler with `limit`, `resolveScope`, and `loadPullChanges`
- **THEN** the code SHALL continue to typecheck
- **AND** the handler SHALL preserve existing pull behavior

#### Scenario: Existing standalone status handler remains source-compatible

- **WHEN** existing code imports `createSyncStatusHandler` from `baresync/server`
- **AND** creates a status handler with `resolveScope` and `loadSyncStatus`
- **THEN** the code SHALL continue to typecheck
- **AND** the handler SHALL preserve existing status behavior

### Requirement: Raw Web Request ownership guidance

The preferred batteries-included server integration SHALL pass the original raw Web `Request` to `syncServer.push`, `syncServer.pull`, and `syncServer.status`. Documentation and templates SHALL warn against framework middleware or route body parsing that consumes the request body before Baresync reads it.

#### Scenario: Hono adapter passes raw request

- **WHEN** documentation or templates show a Hono sync route
- **THEN** the route SHALL pass `c.req.raw` directly to the grouped Baresync handler
- **AND** the route SHALL NOT call `c.req.json()`, `c.req.text()`, or `c.req.parseBody()` before invoking Baresync

#### Scenario: Elysia adapter passes original request without body parsing

- **WHEN** documentation or templates show an Elysia sync route
- **THEN** the route SHALL pass the original `request` directly to the grouped Baresync handler
- **AND** the route SHALL configure Elysia so it does not parse or consume the body before Baresync reads it
- **AND** the route SHALL NOT reconstruct a `Request` from `c.body`

#### Scenario: Docs explain reconstructed request risk

- **WHEN** a user reads Baresync server integration guidance
- **THEN** the guidance SHALL explain that push idempotency hashes raw request bytes
- **AND** the guidance SHALL explain that reconstructing a `Request` from a parsed body can change byte identity, payload measurement, and idempotency conflict semantics
