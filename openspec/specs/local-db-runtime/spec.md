## ADDED Requirements

### Requirement: SQLite pool initialization

The `crates/baresync-core/src/db.rs` module SHALL export a `connect_db(path: &str)` function that creates a SQLite pool with:
- `create_if_missing(true)`
- WAL journal mode
- Normal synchronous mode
- 5-second busy timeout
- `foreign_keys = ON`
- `max_connections = 1`
- 3-second acquire timeout

#### Scenario: Pool created with correct settings

- **WHEN** `connect_db` is called with a valid path
- **THEN** a `SqlitePool` SHALL be returned with WAL mode, foreign_keys ON, and max_connections 1

#### Scenario: Missing parent directory causes error

- **WHEN** `connect_db` is called with a path whose parent directory does not exist
- **THEN** the function SHALL return an error

### Requirement: SQL query types

The `crates/baresync-core/src/drizzle_proxy.rs` module SHALL define:
- `SqlQuery { sql: String, params: Vec<Value>, method: String }`
- `SqlRow { columns: Vec<String>, values: Vec<Value> }`
- `SqlStatement { sql: String, params: Vec<Value> }`
- `BatchResult { last_insert_id: i64, rows_affected: u64 }`

#### Scenario: SqlQuery deserializes from Tauri invoke

- **WHEN** a JSON object `{ "sql": "SELECT 1", "params": [], "method": "all" }` is deserialized as `SqlQuery`
- **THEN** the `sql`, `params`, and `method` fields SHALL match the input

### Requirement: run_sql execution

The `crates/baresync-core/src/drizzle_proxy.rs` module SHALL export `run_sql(pool, query)` that executes a `SqlQuery` against the pool. When `method` is `"run"`, it SHALL execute without returning rows. Otherwise, it SHALL return `Vec<SqlRow>`.

#### Scenario: run method returns empty rows

- **WHEN** `run_sql` is called with `method: "run"` and an INSERT statement
- **THEN** an empty `Vec<SqlRow>` SHALL be returned

#### Scenario: all method returns rows

- **WHEN** `run_sql` is called with `method: "all"` and a SELECT statement
- **THEN** rows SHALL be returned with column names and JSON values

#### Scenario: Parameterized query binds values

- **WHEN** `run_sql` is called with `params: [42, "test"]`
- **THEN** the parameters SHALL be bound to the SQL statement in order

### Requirement: run_sql_batch execution

The `crates/baresync-core/src/drizzle_proxy.rs` module SHALL export `run_sql_batch(pool, statements)` that executes all statements in a single transaction. If any statement fails, the entire transaction SHALL roll back.

#### Scenario: All statements succeed

- **WHEN** `run_sql_batch` is called with two INSERT statements
- **THEN** both SHALL be committed, and `BatchResult` SHALL reflect total rows affected

#### Scenario: Second statement fails rolls back first

- **WHEN** `run_sql_batch` is called with a valid INSERT followed by an invalid SQL statement
- **THEN** the first INSERT SHALL be rolled back and an error SHALL be returned

### Requirement: get_db_info helper

The `crates/baresync-core/src/db.rs` module SHALL export `get_db_info(path)` that returns `DbInfo { db_path, size_bytes, size_formatted }`.

#### Scenario: DB file info returned

- **WHEN** `get_db_info` is called with a path to an existing SQLite file
- **THEN** the result SHALL include the path, byte size, and human-readable size string

### Requirement: JS Drizzle proxy database helper

The `packages/baresync/src/db/drizzle-proxy.ts` module SHALL export `createTauriDrizzleDatabase(input)` that creates a Drizzle ORM database instance backed by Tauri's `invoke` for `run_sql` and `run_sql_batch` commands.

#### Scenario: Database created with invoke adapter

- **WHEN** `createTauriDrizzleDatabase` is called with `{ schema, commands: { runSql: "run_sql", runSqlBatch: "run_sql_batch" } }`
- **THEN** a Drizzle database SHALL be returned that routes queries through the specified Tauri commands

#### Scenario: Custom invoke function for testing

- **WHEN** `createTauriDrizzleDatabase` is called with a custom `invoke` function
- **THEN** the database SHALL use the custom invoke instead of Tauri's default

### Requirement: Consumer local DB integration contract
The local DB runtime SHALL document how consumer apps should configure SQLite path ownership, Drizzle proxy commands, embedded migrations, migration status, and DB info checks.

#### Scenario: DB path strategy documented
- **WHEN** a consumer reads local DB integration guidance
- **THEN** it SHALL explain how to choose a stable app-owned SQLite path and how that path relates to desktop restart, Android app data reset, uninstall/reinstall, and fixture smoke validation

#### Scenario: Drizzle proxy setup documented
- **WHEN** a consumer wires local Drizzle queries
- **THEN** the guidance SHALL show how `createTauriDrizzleDatabase` maps Drizzle proxy calls to `run_sql` and `run_sql_batch`

#### Scenario: Migration and DB info checks documented
- **WHEN** a consumer validates local DB setup
- **THEN** the guidance SHALL include checks for `run_migrations`, `get_migration_status`, `get_db_info`, and a basic Drizzle proxy read

### Requirement: Local DB failure diagnosis
The local DB runtime integration SHALL define what evidence is useful when DB initialization, migration, or proxy queries fail.

#### Scenario: DB failure evidence
- **WHEN** a local DB integration failure occurs
- **THEN** the guidance SHALL identify DB path, file size, migration records, SQLite error, command name, SQL method, and redacted query shape as useful diagnostic evidence
