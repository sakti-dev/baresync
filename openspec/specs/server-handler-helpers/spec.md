## Purpose

TBD. Framework-neutral sync handler factories for Baresync servers.

## ADDED Requirements

### Requirement: Framework-neutral sync handler factories

The `packages/baresync/src/server` export path SHALL provide framework-neutral handler factories for push, status, and pull. Each factory SHALL return a function that accepts a Web `Request` and app-defined context and resolves to a Web `Response`.

#### Scenario: Handler works with Web Request and app context

- **WHEN** a consumer creates a sync handler and calls it with a `Request` plus a context object
- **THEN** the handler SHALL return a `Response`
- **AND** the handler SHALL NOT require Hono, Elysia, Next, Bun, or Workers-specific request types

### Requirement: Push handler composes server primitives

`createSyncPushHandler` SHALL decode a JSON push request, validate push limits, resolve the requested scope, order push changes by contract upsert order, run app push work inside the configured idempotency guard, and encode the returned push body as JSON.

The app SHALL provide `resolveScope` and `applyPushChanges` callbacks. The handler SHALL pass `scope`, `scopeId`, `clientId`, `idempotencyKey`, `requestHash`, ordered `changes`, and `syncUpdatedAt` to `applyPushChanges`.

#### Scenario: Push handler applies authorized changes

- **WHEN** a valid push request is received and `resolveScope` returns an authorized scope
- **THEN** `applyPushChanges` SHALL be called with ordered table changes and the authorized scope
- **AND** the handler SHALL return the encoded push response body returned by `applyPushChanges`

#### Scenario: Push handler rejects unauthorized scope

- **WHEN** a push request is received and `resolveScope` returns an unauthorized result
- **THEN** `applyPushChanges` SHALL NOT be called
- **AND** the handler SHALL return a `Response` with the status and body supplied by `resolveScope`

#### Scenario: Push handler replays idempotent response

- **WHEN** the same `clientId`, `idempotencyKey`, and request hash are received after a completed push
- **THEN** the handler SHALL return the cached push response
- **AND** `applyPushChanges` SHALL NOT run again

### Requirement: Status handler composes server primitives

`createSyncStatusHandler` SHALL decode a JSON status request, resolve the requested scope, call app-provided `loadSyncStatus`, and encode the returned status body as JSON.

The app SHALL provide `resolveScope` and `loadSyncStatus` callbacks. The handler SHALL pass `scope`, `scopeId`, and `cursor` to `loadSyncStatus`.

#### Scenario: Status handler returns changed table metadata

- **WHEN** a valid status request is received and `resolveScope` returns an authorized scope
- **THEN** `loadSyncStatus` SHALL be called with the authorized scope and cursor
- **AND** the handler SHALL return an encoded status response containing `changedTables`, `hasChanges`, `cursor`, and `serverTime`

#### Scenario: Status handler rejects unauthorized scope

- **WHEN** a status request is received and `resolveScope` returns an unauthorized result
- **THEN** `loadSyncStatus` SHALL NOT be called
- **AND** the handler SHALL return a `Response` with the status and body supplied by `resolveScope`

### Requirement: Pull handler composes server primitives

`createSyncPullHandler` SHALL decode a JSON pull request, resolve the requested scope, call app-provided `loadPullChanges`, and encode the returned pull body as JSON.

The app SHALL provide `resolveScope` and `loadPullChanges` callbacks. The handler SHALL pass `scope`, `scopeId`, `tables`, `cursor`, and `limit` to `loadPullChanges`.

#### Scenario: Pull handler returns scoped changes

- **WHEN** a valid pull request is received and `resolveScope` returns an authorized scope
- **THEN** `loadPullChanges` SHALL be called with the authorized scope, requested table list, cursor, and limit
- **AND** the handler SHALL return the encoded pull response body returned by `loadPullChanges`

#### Scenario: Pull handler rejects unauthorized scope

- **WHEN** a pull request is received and `resolveScope` returns an unauthorized result
- **THEN** `loadPullChanges` SHALL NOT be called
- **AND** the handler SHALL return a `Response` with the status and body supplied by `resolveScope`

### Requirement: Framework examples use small adapters

Documentation or examples for Hono and Elysia SHALL adapt framework request/context objects to the framework-neutral handler functions without introducing framework-specific exports.

#### Scenario: Hono route delegates to handler

- **WHEN** a Hono route receives a sync request
- **THEN** the example SHALL pass `c.req.raw` and app context to the Baresync handler

#### Scenario: Elysia route delegates to handler

- **WHEN** an Elysia route receives a sync request
- **THEN** the example SHALL pass `request` and app context to the Baresync handler
