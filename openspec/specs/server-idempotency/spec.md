## ADDED Requirements

### Requirement: createIdempotencyGuard
The server package SHALL export a `createIdempotencyGuard` function that accepts `{ db }` and returns a guard object with a `run` method. The `db` option SHALL be typed as a dialect-agnostic transaction-capable database contract rather than a SQLite-specific Drizzle type. The `run` method SHALL accept `{ clientId, idempotencyKey, requestHash }` and an async callback, and implement a load → reserve → execute → finalize flow within a database transaction.

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

### Requirement: Idempotency database contract is dialect agnostic

The server package SHALL define the idempotency database contract around transactional execution and SHALL NOT expose `drizzle-orm/sqlite-proxy` as the required public idempotency database type.

#### Scenario: Public idempotency type does not require sqlite-proxy
- **WHEN** a consumer imports server idempotency APIs from `baresync/server`
- **THEN** the consumer SHALL NOT need to import `SqliteRemoteDatabase` or `drizzle-orm/sqlite-proxy` to type a normal SQLite server route

#### Scenario: Compatible Drizzle backends share the same call shape
- **WHEN** a compatible Drizzle database instance provides a transaction API usable by the idempotency guard
- **THEN** the consumer SHALL pass it as the parent `db` option on `createSyncServer` without changing the grouped route shape

### Requirement: Idempotency uses library-managed table
The idempotency guard SHALL use the `sync_batch_requests` table by convention. The consumer SHALL NOT need to pass or configure the table name.

#### Scenario: Guard uses sync_batch_requests by default
- **WHEN** `createIdempotencyGuard({ db })` is called
- **THEN** the guard SHALL read from and write to the `sync_batch_requests` table without any table name configuration

### Requirement: Pending sentinel value
The idempotency guard SHALL reserve a pending slot by inserting a row with `status = "pending"` and `response_body = '{"pending":true}'`. The sentinel SHALL be replaced with the actual response upon finalize (setting `status = "completed"`).

#### Scenario: Reserve inserts pending sentinel
- **WHEN** the guard reserves a slot for a new idempotency key
- **THEN** a row SHALL be inserted into `sync_batch_requests` with `status = "pending"` and `response_body = '{"pending":true}'`

### Requirement: Unique constraint on clientId + idempotencyKey
The `sync_batch_requests` table SHALL have a unique index on `(client_id, idempotency_key)`.

#### Scenario: Concurrent INSERT fails with unique constraint
- **WHEN** two concurrent transactions try to INSERT with the same `(client_id, idempotency_key)`
- **THEN** the second INSERT SHALL fail, and the guard SHALL attempt to load the cached response

### Requirement: computeSyncRequestHash
The server package SHALL export a `computeSyncRequestHash` function that computes SHA-256 of the serialized JSON push body and returns the hex-encoded hash string.

#### Scenario: Hash is deterministic for same body
- **WHEN** `computeSyncRequestHash` is called twice with the same body
- **THEN** the same hash string SHALL be returned

#### Scenario: Hash differs for different bodies
- **WHEN** `computeSyncRequestHash` is called with different bodies
- **THEN** different hash strings SHALL be returned
