## MODIFIED Requirements

### Requirement: SQLite pool connection with standard configuration

The `crates/baresync-core/src/db.rs` module SHALL export a `LocalDatabase` struct with a `connect` method that creates a `DbClient` backed by `rusqlite` and configured with:

- create database file if missing
- WAL journal mode
- Normal synchronous mode
- 5-second busy timeout
- `PRAGMA foreign_keys = ON`
- a single worker-owned SQLite connection for Drizzle sqlite-proxy transaction safety

#### Scenario: Fresh database is created and configured

- **WHEN** `LocalDatabase::connect` is called with a path to a non-existent file
- **THEN** the SQLite database file is created, WAL mode is active, foreign keys are ON, and the returned local database exposes a `DbClient`

#### Scenario: Existing database is opened

- **WHEN** `LocalDatabase::connect` is called with a path to an existing SQLite database
- **THEN** the `rusqlite` worker connection opens it successfully without recreating the file, and WAL/foreign_keys settings are applied

### Requirement: Drizzle proxy query execution

The `crates/baresync-core/src/drizzle_proxy.rs` module SHALL export a `run_sql` function that accepts a `SqlQuery` struct (with `sql`, `params`, and `method` fields) and a `DbClient` reference, and returns `Vec<SqlRow>`.

For `method: "run"`, the function SHALL execute the query through the `rusqlite` worker and return an empty vec. For other methods, it SHALL return rows with columns and JSON-converted values.

#### Scenario: Select query returns rows

- **WHEN** `run_sql` is called with `method: "all"`, `sql: "SELECT id, name FROM categories"`, and no params
- **THEN** the result contains `SqlRow` entries with `columns: ["id", "name"]` and corresponding values

#### Scenario: Run query returns empty result

- **WHEN** `run_sql` is called with `method: "run"`, `sql: "INSERT INTO categories ..."`
- **THEN** the result is an empty vec and no error is returned

### Requirement: Drizzle proxy batch transaction execution

The `crates/baresync-core/src/drizzle_proxy.rs` module SHALL export a `run_sql_batch` function that accepts a vec of `SqlStatement` structs and a `DbClient` reference, and returns a `BatchResult`.

All statements SHALL execute within a single `rusqlite` transaction on the worker thread. If any statement fails, the entire batch SHALL roll back.

#### Scenario: Batch commits all statements

- **WHEN** `run_sql_batch` is called with two valid INSERT statements
- **THEN** both rows exist in the database and `BatchResult` reflects the total rows affected

#### Scenario: Batch rolls back on failure

- **WHEN** `run_sql_batch` is called with a valid INSERT followed by an invalid SQL statement
- **THEN** neither row exists in the database and an error is returned
