## ADDED Requirements

### Requirement: SQLite pool connection with standard configuration

The `crates/baresync-core/src/db.rs` module SHALL export a `LocalDatabase` struct with a `connect` method that creates a SQLite pool configured with:

- `create_if_missing(true)`
- `journal_mode(Wal)`
- `synchronous(Normal)`
- `busy_timeout(5 seconds)`
- `pragma("foreign_keys", "ON")`
- `max_connections(1)` for Drizzle sqlite-proxy transaction safety
- `acquire_timeout(3 seconds)`

#### Scenario: Fresh database is created and configured

- **WHEN** `LocalDatabase::connect` is called with a path to a non-existent file
- **THEN** the SQLite database file is created, WAL mode is active, foreign keys are ON, and the pool has exactly 1 max connection

#### Scenario: Existing database is opened

- **WHEN** `LocalDatabase::connect` is called with a path to an existing SQLite database
- **THEN** the pool connects successfully without recreating the file, and WAL/foreign_keys settings are applied

### Requirement: Drizzle proxy query execution

The `crates/baresync-core/src/drizzle_proxy.rs` module SHALL export a `run_sql` function that accepts a `SqlQuery` struct (with `sql`, `params`, and `method` fields) and a `SqlitePool` reference, and returns `Vec<SqlRow>`.

For `method: "run"`, the function SHALL execute the query and return an empty vec. For other methods, it SHALL return rows with columns and JSON-converted values.

#### Scenario: Select query returns rows

- **WHEN** `run_sql` is called with `method: "all"`, `sql: "SELECT id, name FROM categories"`, and no params
- **THEN** the result contains `SqlRow` entries with `columns: ["id", "name"]` and corresponding values

#### Scenario: Run query returns empty result

- **WHEN** `run_sql` is called with `method: "run"`, `sql: "INSERT INTO categories ..."`
- **THEN** the result is an empty vec and no error is returned

### Requirement: Drizzle proxy batch transaction execution

The `crates/baresync-core/src/drizzle_proxy.rs` module SHALL export a `run_sql_batch` function that accepts a vec of `SqlStatement` structs and a `SqlitePool` reference, and returns a `BatchResult`.

All statements SHALL execute within a single transaction. If any statement fails, the entire batch SHALL roll back.

#### Scenario: Batch commits all statements

- **WHEN** `run_sql_batch` is called with two valid INSERT statements
- **THEN** both rows exist in the database and `BatchResult` reflects the total rows affected

#### Scenario: Batch rolls back on failure

- **WHEN** `run_sql_batch` is called with a valid INSERT followed by an invalid SQL statement
- **THEN** neither row exists in the database and an error is returned

### Requirement: Database info helper

The `crates/baresync-core/src/drizzle_proxy.rs` module SHALL export a `get_db_info` function that accepts a database path and returns a `DbInfo` struct with `db_path`, `size_bytes`, and `size_formatted`.

#### Scenario: Database info returns file metadata

- **WHEN** `get_db_info` is called with a path to an existing database file
- **THEN** the result contains the correct path, a positive `size_bytes`, and a human-readable `size_formatted` string

### Requirement: Embedded migration discovery

The `crates/baresync-core/src/migrations.rs` module SHALL export a `MigrationFile` struct (with `name` and `sql` fields) and a function to run migrations against a pool.

Migrations SHALL be discovered from embedded SQL files provided by the consumer via `include_str!`. Migration filenames SHALL determine execution order (sorted lexicographically).

#### Scenario: Migrations run in filename order

- **WHEN** three migration files `0001_create_categories.sql`, `0002_create_products.sql`, `0003_create_orders.sql` are provided
- **THEN** migrations execute in the order 0001, 0002, 0003

### Requirement: Migration execution with idempotent tracking

The migration runner SHALL create a `__drizzle_migrations` table (with `id`, `hash`, and `created_at` columns) if it does not exist. For each migration, the runner SHALL:

1. Check if a row with the matching hash exists in `__drizzle_migrations`
2. Skip already-applied migrations
3. Split migration SQL by `--> statement-breakpoint`
4. Execute each statement within a transaction
5. Record the applied migration with current epoch milliseconds

#### Scenario: Fresh database applies all migrations

- **WHEN** migrations are run against a fresh database
- **THEN** all migration SQL is executed, `__drizzle_migrations` contains one row per migration, and no error is returned

#### Scenario: Already-applied migrations are skipped

- **WHEN** migrations are run against a database where all migrations are already recorded
- **THEN** no SQL is executed and the function returns immediately

#### Scenario: Failed migration rolls back and does not record

- **WHEN** a migration's second statement fails
- **THEN** the first statement's effects are rolled back and no row is inserted into `__drizzle_migrations`

#### Scenario: Re-running after failure succeeds

- **WHEN** a migration previously failed and is run again after the SQL is corrected
- **THEN** the corrected migration executes successfully and is recorded

### Requirement: JS Drizzle proxy database helper

The `packages/baresync/src/db/drizzle-proxy.ts` module SHALL export `createTauriDrizzleDatabase(input)` that accepts a `schema` object and an optional `commands` configuration mapping `runSql` and `runSqlBatch` to Tauri command names.

The function SHALL return a Drizzle `BetterSQLite3Database` instance using the `drizzle-orm/sqlite-proxy` driver configured to invoke the specified Tauri commands.

#### Scenario: Database helper invokes Tauri commands

- **WHEN** a Drizzle query is executed on the returned database instance
- **THEN** the corresponding Tauri command (`run_sql` or `run_sql_batch`) is invoked with the serialized query

### Requirement: Tauri plugin DB command wrappers

The `crates/tauri-plugin-baresync` crate SHALL expose Tauri commands `run_sql`, `run_sql_batch`, and `get_db_info` that delegate to `baresync-core` functions.

#### Scenario: run_sql command executes query via core

- **WHEN** the `run_sql` Tauri command is invoked with a `SqlQuery` parameter
- **THEN** the command delegates to `baresync-core::drizzle_proxy::run_sql` and returns the result
