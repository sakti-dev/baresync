## MODIFIED Requirements

### Requirement: SQLite pool connection with standard configuration
The `crates/baresync-core/src/db.rs` module SHALL export a `LocalDatabase` struct with a `connect` method that creates a database client configured with:

- `create_if_missing(true)`
- `journal_mode(Wal)`
- `synchronous(Normal)`
- `busy_timeout(5 seconds)`
- `pragma("foreign_keys", "ON")`
- a single logical database execution lane for Drizzle sqlite-proxy transaction safety
- `acquire_timeout(3 seconds)` or an equivalent request timeout while SQLx remains the backend

#### Scenario: Fresh database is created and configured

- **WHEN** `LocalDatabase::connect` is called with a path to a non-existent file
- **THEN** the SQLite database file is created, WAL mode is active, foreign keys are ON, and the returned local database exposes a `DbClient`

#### Scenario: Existing database is opened

- **WHEN** `LocalDatabase::connect` is called with a path to an existing SQLite database
- **THEN** the database client connects successfully without recreating the file, and WAL/foreign_keys settings are applied

### Requirement: Drizzle proxy query execution
The `crates/baresync-core/src/drizzle_proxy.rs` module SHALL export a `run_sql` function that accepts a `SqlQuery` struct (with `sql`, `params`, and `method` fields) and a `DbClient` reference, and returns `Vec<SqlRow>`.

For `method: "run"`, the function SHALL execute the query and return an empty vec. For other methods, it SHALL return rows with columns and JSON-converted values.

#### Scenario: Select query returns rows

- **WHEN** `run_sql` is called with `method: "all"`, `sql: "SELECT id, name FROM categories"`, and no params
- **THEN** the result contains `SqlRow` entries with `columns: ["id", "name"]` and corresponding values

#### Scenario: Run query returns empty result

- **WHEN** `run_sql` is called with `method: "run"`, `sql: "INSERT INTO categories ..."`
- **THEN** the result is an empty vec and no error is returned

### Requirement: Drizzle proxy batch transaction execution
The `crates/baresync-core/src/drizzle_proxy.rs` module SHALL export a `run_sql_batch` function that accepts a vec of `SqlStatement` structs and a `DbClient` reference, and returns a `BatchResult`.

All statements SHALL execute within a single transaction. If any statement fails, the entire batch SHALL roll back. No unrelated database request SHALL execute between statements in the batch.

#### Scenario: Batch commits all statements

- **WHEN** `run_sql_batch` is called with two valid INSERT statements
- **THEN** both rows exist in the database and `BatchResult` reflects the total rows affected

#### Scenario: Batch rolls back on failure

- **WHEN** `run_sql_batch` is called with a valid INSERT followed by an invalid SQL statement
- **THEN** neither row exists in the database and an error is returned

### Requirement: Tauri plugin DB command wrappers
The `crates/tauri-plugin-baresync` crate SHALL expose Tauri commands `run_sql`, `run_sql_batch`, and `get_db_info` that delegate to `baresync-core` functions using the plugin's `DbClient`.

#### Scenario: run_sql command executes query via core

- **WHEN** the `run_sql` Tauri command is invoked with a `SqlQuery` parameter
- **THEN** the command delegates to `baresync-core::drizzle_proxy::run_sql` and returns the result

### Requirement: Client identity persistence table
The local database SHALL include a `sync_client_identity` table for persisting a stable device-level client ID:

```sql
CREATE TABLE IF NOT EXISTS sync_client_identity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
);
```

This table SHALL be created during database client initialization or migration.

#### Scenario: Table created on first connect

- **WHEN** the database is initialized and `sync_client_identity` does not exist
- **THEN** the table SHALL be created

#### Scenario: Client ID generated on first access

- **WHEN** no row exists in `sync_client_identity`
- **THEN** a new UUID v4 SHALL be generated, inserted, and returned

#### Scenario: Client ID reused on subsequent access

- **WHEN** a row exists in `sync_client_identity`
- **THEN** the existing `client_id` SHALL be returned without generating a new one
