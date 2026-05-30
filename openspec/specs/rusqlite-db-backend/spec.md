## Purpose

The `rusqlite` worker backend implementation for Baresync's local SQLite `DbClient`.

## Requirements

### Requirement: Dedicated rusqlite worker backend
Baresync SHALL implement `DbClient` using `rusqlite` behind a dedicated worker thread. The worker thread SHALL own the `rusqlite::Connection`; async callers SHALL NOT execute blocking SQLite work directly on the async runtime.

#### Scenario: Worker owns connection
- **WHEN** `DbClient` opens a local SQLite database
- **THEN** exactly one worker thread SHALL own the `rusqlite::Connection` used for that database client

#### Scenario: Async caller awaits reply
- **WHEN** an async caller submits a query through `DbClient`
- **THEN** the caller SHALL await a reply without directly blocking the async runtime on `rusqlite` execution

### Requirement: Message-based database requests
The `rusqlite` backend SHALL process database work through request/reply messages. Each request SHALL contain all information needed for the worker to complete the operation and return success or failure.

#### Scenario: Request returns result
- **WHEN** the worker completes a database request
- **THEN** it SHALL send the operation result back to the awaiting caller

#### Scenario: Dropped caller does not corrupt worker
- **WHEN** a caller drops the reply future while the worker is executing the request
- **THEN** the worker SHALL finish the SQLite operation and continue processing later requests without panicking

### Requirement: Worker transaction atomicity
The `rusqlite` backend SHALL execute batch, migration, and internal transaction requests fully inside the worker without interleaving other requests.

#### Scenario: Batch is atomic
- **WHEN** a batch request contains multiple SQL statements
- **THEN** the worker SHALL execute all statements inside one SQLite transaction

#### Scenario: Failed batch rolls back
- **WHEN** any statement in a batch transaction fails
- **THEN** the worker SHALL roll back the transaction and return an error

#### Scenario: No interleaving inside transaction
- **WHEN** another request is queued while a transaction request is running
- **THEN** the queued request SHALL wait until the transaction commits or rolls back

### Requirement: rusqlite value compatibility
The `rusqlite` backend SHALL preserve Baresync's existing SQL value binding and row conversion behavior.

#### Scenario: Parameters bind in order
- **WHEN** a SQL request includes JSON-compatible parameters
- **THEN** the worker SHALL bind those parameters to `rusqlite` statements in order

#### Scenario: Rows convert to JSON-compatible values
- **WHEN** a query returns SQLite NULL, INTEGER, REAL, TEXT, or BLOB values
- **THEN** the backend SHALL convert them into Baresync's existing dynamic row/value representation without exposing `rusqlite` row types

### Requirement: Plain SQLite default
The `rusqlite` backend SHALL open normal plaintext SQLite databases by default.

#### Scenario: No encryption support in backend swap
- **WHEN** this change is implemented
- **THEN** Baresync SHALL NOT require encryption keys, SQLCipher feature flags, or key providers to open the local database

#### Scenario: Existing plaintext database opens
- **WHEN** a Baresync plaintext SQLite database created by the previous backend exists
- **THEN** the `rusqlite` backend SHALL open it and preserve existing data and migration records
