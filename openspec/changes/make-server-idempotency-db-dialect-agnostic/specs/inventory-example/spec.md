## ADDED Requirements

### Requirement: Inventory server route uses dialect-neutral idempotency API
The inventory example server route SHALL demonstrate the direct API-side idempotency database usage by passing the server Drizzle database as `idempotency: { db }`.

#### Scenario: Inventory route has no sqlite-proxy cast
- **WHEN** a contributor reads `examples/inventory-json-polling/apps/server/src/v1/routes.ts`
- **THEN** the route SHALL NOT import `SqliteRemoteDatabase` from `drizzle-orm/sqlite-proxy`
- **AND** the route SHALL NOT create an `idempotencyDb` cast variable

#### Scenario: Inventory route passes direct database
- **WHEN** a contributor reads the `createSyncPushHandler` call in `examples/inventory-json-polling/apps/server/src/v1/routes.ts`
- **THEN** the push handler SHALL receive `idempotency: { db }`
- **AND** the route SHALL keep existing scope resolution, repository creation, and Hono mounting behavior
