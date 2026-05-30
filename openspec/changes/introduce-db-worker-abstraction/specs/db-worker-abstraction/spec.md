## ADDED Requirements

### Requirement: Database client abstraction
Baresync SHALL provide a `DbClient` abstraction for local SQLite access. Core and plugin code SHALL use `DbClient` instead of exposing backend-specific connection or pool types in public Rust contracts.

#### Scenario: Core code receives database client
- **WHEN** core sync, migration, Drizzle proxy, outbox, cursor, schema, cleanup, and local state functions need database access
- **THEN** their public Rust contracts SHALL accept a `DbClient` reference or owning handle instead of `SqlitePool` or `SqliteConnection`

#### Scenario: Backend connection type is hidden
- **WHEN** a consumer uses the public Rust API
- **THEN** the API SHALL NOT require importing SQLx connection or pool types for normal Baresync database operations

### Requirement: Serialized database execution
The `DbClient` abstraction SHALL serialize local database operations through a single logical execution lane.

#### Scenario: Concurrent writes are serialized
- **WHEN** two async tasks submit write operations through the same `DbClient`
- **THEN** the database operations SHALL execute one at a time without concurrent writes against separate local SQLite connections

#### Scenario: Request order is preserved per client
- **WHEN** a task awaits operation A before submitting operation B through the same `DbClient`
- **THEN** operation A SHALL complete before operation B starts

### Requirement: Atomic batch execution
The `DbClient` abstraction SHALL execute batch requests as complete transaction-scoped requests. No unrelated database request SHALL interleave between statements in a batch.

#### Scenario: Batch commits all statements
- **WHEN** a batch request contains multiple valid write statements
- **THEN** all statements SHALL commit in a single transaction

#### Scenario: Batch rolls back on failure
- **WHEN** a batch request fails after executing one or more prior statements
- **THEN** all statements in that batch SHALL roll back and no batch changes SHALL remain

#### Scenario: Background sync cannot interleave inside batch
- **WHEN** a Drizzle proxy batch and a background sync database operation are submitted concurrently
- **THEN** the background sync operation SHALL NOT execute between statements of the batch transaction

### Requirement: Backend-neutral query primitives
The `DbClient` abstraction SHALL expose backend-neutral query primitives needed by Baresync without exposing SQLx or `rusqlite` types.

#### Scenario: Query returns dynamic rows
- **WHEN** a SQL query returns rows with dynamic columns
- **THEN** `DbClient` SHALL return rows as column names and JSON-compatible values usable by the Drizzle proxy

#### Scenario: Execute returns write metadata
- **WHEN** a SQL statement is executed without returning rows
- **THEN** `DbClient` SHALL expose affected-row and last-insert metadata needed by plugin events and batch results

### Requirement: Plain SQLite behavior preserved
Introducing `DbClient` SHALL NOT change the default database storage mode.

#### Scenario: No encryption configured
- **WHEN** Baresync opens a database with the new database client abstraction
- **THEN** it SHALL create or open a normal plaintext SQLite database with the same path and migration behavior as before

#### Scenario: No SQLCipher API added
- **WHEN** this change is implemented
- **THEN** Baresync SHALL NOT expose encryption key providers, SQLCipher configuration, or encrypted database setup APIs
