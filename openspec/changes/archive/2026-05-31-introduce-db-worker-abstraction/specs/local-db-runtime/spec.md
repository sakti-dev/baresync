## MODIFIED Requirements

### Requirement: SQLite pool initialization

The `crates/baresync-core/src/db.rs` module SHALL export a `connect_db(path: &str)` function that creates a `DbClient` with:
- `create_if_missing(true)`
- WAL journal mode
- Normal synchronous mode
- 5-second busy timeout
- `foreign_keys = ON`
- a single logical database execution lane
- 3-second acquire timeout or equivalent request timeout while SQLx remains the backend

#### Scenario: Pool created with correct settings

- **WHEN** `connect_db` is called with a valid path
- **THEN** a `DbClient` SHALL be returned with WAL mode, foreign_keys ON, and serialized database execution

#### Scenario: Missing parent directory causes error

- **WHEN** `connect_db` is called with a path whose parent directory does not exist
- **THEN** the function SHALL return an error

### Requirement: run_sql execution

The `crates/baresync-core/src/drizzle_proxy.rs` module SHALL export `run_sql(db, query)` that executes a `SqlQuery` against a `DbClient`. When `method` is `"run"`, it SHALL execute without returning rows. Otherwise, it SHALL return `Vec<SqlRow>`.

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

The `crates/baresync-core/src/drizzle_proxy.rs` module SHALL export `run_sql_batch(db, statements)` that executes all statements through a `DbClient` in a single transaction. If any statement fails, the entire transaction SHALL roll back. No unrelated database request SHALL interleave inside the batch transaction.

#### Scenario: All statements succeed

- **WHEN** `run_sql_batch` is called with two INSERT statements
- **THEN** both SHALL be committed, and `BatchResult` SHALL reflect total rows affected

#### Scenario: Second statement fails rolls back first

- **WHEN** `run_sql_batch` is called with a valid INSERT followed by an invalid SQL statement
- **THEN** the first INSERT SHALL be rolled back and an error SHALL be returned
