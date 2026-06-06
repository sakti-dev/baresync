## MODIFIED Requirements

### Requirement: Push handler composes server primitives

`createSyncPushHandler` SHALL decode a JSON push request, validate push limits, resolve the requested scope, order push changes by contract upsert order, run app push work inside the configured idempotency guard, and encode the returned push body as JSON.

The app SHALL provide `resolveScope` and `applyPushChanges` callbacks. The app SHALL provide an `idempotency.db` value that satisfies the server idempotency transaction-capable database contract. The handler SHALL pass `scope`, `scopeId`, `clientId`, `idempotencyKey`, `requestHash`, ordered `changes`, and `syncUpdatedAt` to `applyPushChanges`.

The handler options SHALL NOT include an `encoding` field — JSON is the only supported request and response format. The handler options SHALL NOT require consumer code to type `idempotency.db` as `SqliteRemoteDatabase`.

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

#### Scenario: Push handler accepts direct Drizzle database

- **WHEN** a server route creates a push handler with `idempotency: { db }`
- **THEN** TypeScript SHALL accept the route without a `SqliteRemoteDatabase` import or cast in route code

## ADDED Requirements

### Requirement: Server handler public types avoid SQLite proxy coupling
The `baresync/server` public type surface for framework-neutral handlers SHALL NOT force API route modules to import `drizzle-orm/sqlite-proxy`.

#### Scenario: Generated route has no sqlite-proxy import
- **WHEN** a generated or example server route imports `createSyncPushHandler` from `baresync/server`
- **THEN** the route SHALL NOT need an import from `drizzle-orm/sqlite-proxy` to pass its idempotency database
