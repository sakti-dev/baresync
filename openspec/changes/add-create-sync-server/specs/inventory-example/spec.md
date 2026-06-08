## MODIFIED Requirements

### Requirement: Inventory server route uses dialect-neutral idempotency API

The inventory example server route SHALL demonstrate dialect-neutral idempotency database usage through the grouped `createSyncServer` API by passing the server Drizzle database as parent option `db`.

#### Scenario: Inventory route has no sqlite-proxy cast

- **WHEN** a contributor reads `examples/inventory-json-polling/apps/server/src/v1/routes.ts`
- **THEN** the route SHALL NOT import `SqliteRemoteDatabase` from `drizzle-orm/sqlite-proxy`
- **AND** the route SHALL NOT create an `idempotencyDb` cast variable

#### Scenario: Inventory route passes direct database

- **WHEN** a contributor reads the `createSyncServer` call in `examples/inventory-json-polling/apps/server/src/v1/routes.ts`
- **THEN** the grouped server factory SHALL receive parent-level `db`
- **AND** the route SHALL NOT pass `idempotency: { db }` inside `push`
- **AND** the route SHALL keep existing scope resolution, repository creation, authorization, and Hono mounting behavior

## ADDED Requirements

### Requirement: Inventory example uses grouped sync server API

The inventory JSON polling example SHALL use `createSyncServer` as the preferred server route integration API.

#### Scenario: Inventory route imports grouped factory

- **WHEN** a contributor reads `examples/inventory-json-polling/apps/server/src/v1/routes.ts`
- **THEN** the route SHALL import `createSyncServer` from `baresync/server`
- **AND** it SHALL NOT import `createSyncPushHandler`, `createSyncPullHandler`, or `createSyncStatusHandler`

#### Scenario: Inventory Hono routes preserve raw request behavior

- **WHEN** the inventory server receives Hono sync requests for `/push`, `/pull`, or `/status`
- **THEN** authorization SHALL inspect `c.req.raw` without consuming the body
- **AND** the route SHALL pass `c.req.raw` directly to the matching grouped Baresync handler
- **AND** the route SHALL NOT reconstruct a `Request` object from a parsed body
