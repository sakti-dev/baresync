## MODIFIED Requirements

### Requirement: createIdempotencyGuard
The server package SHALL export a `createIdempotencyGuard` function that accepts `{ db }` and returns a guard object with a `run` method. The `db` option SHALL be typed as a dialect-agnostic transaction-capable database contract rather than a SQLite-specific Drizzle type. The `run` method SHALL accept `{ clientId, idempotencyKey, requestHash }` and an async callback, and implement a load -> reserve -> execute -> finalize flow within a database transaction.

#### Scenario: First-time push processes normally
- **WHEN** a push request arrives with a new `(clientId, idempotencyKey)` combination
- **THEN** the guard SHALL reserve a pending slot, execute the callback, finalize with the result, and return the callback's result

#### Scenario: Duplicate push replays cached response
- **WHEN** a push request arrives with `(clientId, idempotencyKey)` that already has a completed response with matching `requestHash`
- **THEN** the guard SHALL return the cached response without executing the callback

#### Scenario: Idempotency key reused with different body
- **WHEN** a push request arrives with `(clientId, idempotencyKey)` that already has a response but with a different `requestHash`
- **THEN** the guard SHALL throw a conflict error (HTTP 409)

#### Scenario: Concurrent push with same key while in progress
- **WHEN** a push request arrives while another request with the same `(clientId, idempotencyKey)` is being processed (pending sentinel exists)
- **THEN** the guard SHALL throw a conflict error (HTTP 409) with message "sync push is already in progress"

#### Scenario: Guard accepts SQLite Drizzle database without route-level proxy cast
- **WHEN** a consumer passes a SQLite Drizzle database returned by `drizzle(...)` to `createIdempotencyGuard({ db })`
- **THEN** TypeScript SHALL accept the call without requiring the consumer to import `SqliteRemoteDatabase` from `drizzle-orm/sqlite-proxy`

## ADDED Requirements

### Requirement: Idempotency database contract is dialect agnostic
The server package SHALL define the idempotency database contract around transactional execution and SHALL NOT expose `drizzle-orm/sqlite-proxy` as the required public idempotency database type.

#### Scenario: Public idempotency type does not require sqlite-proxy
- **WHEN** a consumer imports server idempotency APIs from `baresync/server`
- **THEN** the consumer SHALL NOT need to import `SqliteRemoteDatabase` or `drizzle-orm/sqlite-proxy` to type a normal SQLite server route

#### Scenario: Compatible Drizzle backends share the same call shape
- **WHEN** a compatible Drizzle database instance provides a transaction API usable by the idempotency guard
- **THEN** the consumer SHALL pass it as `idempotency: { db }` without changing the push handler route shape
