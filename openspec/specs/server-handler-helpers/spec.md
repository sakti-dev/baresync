## Purpose

Framework-neutral grouped sync server factory for Baresync servers.

## Requirements

### Requirement: Grouped sync server factory

The `packages/baresync/src/server` export path SHALL provide `createSyncServer` as the grouped batteries-included factory for push, pull, and status sync routes. `createSyncServer` SHALL accept one parent options object containing `db`, `resolveScope`, `push`, `pull`, and `status`, and SHALL return an object containing `push`, `pull`, and `status` handlers.

Each returned handler SHALL accept a Web `Request` and app-defined context and resolve to a Web `Response`. The returned handlers SHALL NOT require Hono, Elysia, Next, Bun, or Workers-specific request types.

#### Scenario: Grouped factory exposes three handlers

- **WHEN** a consumer creates a grouped sync server with `db`, `resolveScope`, `push`, `pull`, and `status`
- **THEN** the grouped factory SHALL return `push`, `pull`, and `status` handlers with the same Web `Request`, app context, and Web `Response` contract as the route-facing server API
- **AND** each handler SHALL accept `(request, context)` arguments
- **AND** each handler SHALL return a Web `Response`

#### Scenario: Grouped factory shares scope resolver

- **WHEN** any grouped handler receives a sync request
- **THEN** it SHALL use the parent `resolveScope` callback
- **AND** route code SHALL NOT need to repeat `resolveScope` inside `push`, `pull`, or `status` options

#### Scenario: Grouped factory shares idempotency database at parent level

- **WHEN** grouped route code configures `createSyncServer`
- **THEN** it SHALL pass the idempotency-capable Drizzle database as parent option `db`
- **AND** it SHALL keep idempotency configuration at the parent server level rather than nesting it under `push`

### Requirement: Grouped push behavior

`createSyncServer` SHALL decode a JSON push request, validate push limits, resolve the requested scope, order push changes by contract upsert order, run app push work inside the configured idempotency guard, and encode the returned push body as JSON.

The app SHALL provide `resolveScope` and `applyPushChanges` callbacks. The handler SHALL pass `scope`, `scopeId`, `clientId`, `idempotencyKey`, `requestHash`, ordered `changes`, and `syncUpdatedAt` to `applyPushChanges`.

The handler options SHALL NOT include an `encoding` field. JSON is the only supported request and response format. The handler options SHALL NOT require consumer code to type `db` as `SqliteRemoteDatabase`.

#### Scenario: Grouped push applies authorized changes

- **WHEN** a valid push request is received and `resolveScope` returns an authorized scope
- **THEN** `applyPushChanges` SHALL be called with ordered table changes and the authorized scope
- **AND** the handler SHALL return the encoded push response body returned by `applyPushChanges`

#### Scenario: Grouped push rejects unauthorized scope

- **WHEN** a push request is received and `resolveScope` returns an unauthorized result
- **THEN** `applyPushChanges` SHALL NOT be called
- **AND** the handler SHALL return a `Response` with the status and body supplied by `resolveScope`

#### Scenario: Grouped push replays idempotent response

- **WHEN** the same `clientId`, `idempotencyKey`, and request hash are received after a completed push
- **THEN** the handler SHALL return the cached push response
- **AND** `applyPushChanges` SHALL NOT run again

### Requirement: Grouped status behavior

`createSyncServer` SHALL decode a JSON status request, resolve the requested scope, call app-provided `loadSyncStatus`, and encode the returned status body as JSON.

The app SHALL provide `resolveScope` and `loadSyncStatus` callbacks. The handler SHALL pass `scope`, `scopeId`, and `cursor` to `loadSyncStatus`.

The handler options SHALL NOT include an `encoding` field.

#### Scenario: Grouped status returns changed table metadata

- **WHEN** a valid status request is received and `resolveScope` returns an authorized scope
- **THEN** `loadSyncStatus` SHALL be called with the authorized scope and cursor
- **AND** the handler SHALL return an encoded status response containing `changedTables`, `hasChanges`, `cursor`, and `serverTime`

#### Scenario: Grouped status rejects unauthorized scope

- **WHEN** a status request is received and `resolveScope` returns an unauthorized result
- **THEN** `loadSyncStatus` SHALL NOT be called
- **AND** the handler SHALL return a `Response` with the status and body supplied by `resolveScope`

### Requirement: Grouped pull behavior

`createSyncServer` SHALL decode a JSON pull request, resolve the requested scope, call app-provided `loadPullChanges`, and encode the returned pull body as JSON.

The app SHALL provide `resolveScope` and `loadPullChanges` callbacks. The handler SHALL pass `scope`, `scopeId`, `tables`, `cursor`, and `limit` to `loadPullChanges`.

The handler options SHALL NOT include an `encoding` field.

#### Scenario: Grouped pull returns scoped changes

- **WHEN** a valid pull request is received and `resolveScope` returns an authorized scope
- **THEN** `loadPullChanges` SHALL be called with the authorized scope, requested table list, cursor, and limit
- **AND** the handler SHALL return the encoded pull response body returned by `loadPullChanges`

#### Scenario: Grouped pull rejects unauthorized scope

- **WHEN** a pull request is received and `resolveScope` returns an unauthorized result
- **THEN** `loadPullChanges` SHALL NOT be called
- **AND** the handler SHALL return a `Response` with the status and body supplied by `resolveScope`

### Requirement: Grouped server public types avoid SQLite proxy coupling

The `baresync/server` public type surface for the grouped server SHALL NOT force API route modules to import `drizzle-orm/sqlite-proxy`.

#### Scenario: Generated route has no sqlite-proxy import

- **WHEN** a generated or example server route imports `createSyncServer` from `baresync/server`
- **THEN** the route SHALL NOT need an import from `drizzle-orm/sqlite-proxy` to pass its parent idempotency database

### Requirement: Framework examples use small adapters

Documentation or examples for Hono and Elysia SHALL adapt framework request/context objects to the grouped server handlers without introducing framework-specific exports.

#### Scenario: Hono route delegates to grouped server

- **WHEN** a Hono route receives a sync request
- **THEN** the example SHALL pass `c.req.raw` and app context to the grouped Baresync handler

#### Scenario: Elysia route delegates to grouped server

- **WHEN** an Elysia route receives a sync request
- **THEN** the example SHALL pass `request` and app context to the grouped Baresync handler
