## 1. TDD Baseline

- [ ] 1.1 Add failing core tests for `DbClient` serialized execution with concurrent write submissions.
- [ ] 1.2 Add failing core tests proving `run_sql_batch` rolls back all statements on failure through the new database client path.
- [ ] 1.3 Add failing core tests proving no unrelated request can interleave inside a database-client batch transaction.
- [ ] 1.4 Add failing plugin host tests proving setup runs migrations before command state is exposed through the database client path.

## 2. Database Client Abstraction

- [ ] 2.1 Add a `DbClient` type and backend-neutral result/value helpers in `crates/baresync-core`.
- [ ] 2.2 Implement `DbClient` on top of the existing SQLx single-connection pool without changing SQLite file format or default plaintext behavior.
- [ ] 2.3 Update `LocalDatabase::connect` and `connect_db` to return or expose `DbClient` instead of `SqlitePool`.
- [ ] 2.4 Ensure database initialization still applies WAL mode, normal synchronous mode, busy timeout, foreign keys, and client identity table creation.

## 3. Core Refactor

- [ ] 3.1 Refactor `drizzle_proxy` functions to accept `DbClient` and preserve `SqlQuery`, `SqlRow`, `SqlStatement`, `SqlExecutionResult`, and `BatchResult` behavior.
- [ ] 3.2 Refactor migration runner functions to accept `DbClient` and preserve ordering, tracking, statement splitting, strict/tolerant behavior, and rollback semantics.
- [ ] 3.3 Refactor sync engine, push, pull, schema, cursor, outbox, local state, cleanup, and GC helpers to use `DbClient` instead of SQLx pool/connection parameters.
- [ ] 3.4 Remove public Rust API exposure of `SqlitePool` and `SqliteConnection` from normal Baresync database operations.

## 4. Tauri Plugin Refactor

- [ ] 4.1 Update `PluginState` to store the database client instead of `Arc<SqlitePool>`.
- [ ] 4.2 Update plugin setup to connect through `DbClient`, run migrations, and manage state only after successful setup.
- [ ] 4.3 Update `run_sql`, `run_sql_batch`, `get_db_info`, `run_migrations`, and `get_migration_status` command logic to use `DbClient`.
- [ ] 4.4 Preserve data-changed events and polling notifications for successful local writes.

## 5. Docs And Specs Alignment

- [ ] 5.1 Update Rust API docs and generated/reference docs that mention `SqlitePool` or pool-based function signatures.
- [ ] 5.2 Update host-testing docs and examples to construct command state with the database client.
- [ ] 5.3 Confirm JS/TypeScript docs remain unchanged except where they reference Rust pool internals.

## 6. Verification

- [ ] 6.1 Run targeted Rust tests for `baresync-core` database, migration, Drizzle proxy, and simulation coverage.
- [ ] 6.2 Run targeted Rust tests for `tauri-plugin-baresync` command host tests.
- [ ] 6.3 Run `bun x ultracite check`.
- [ ] 6.4 Run `bun run typecheck`.
- [ ] 6.5 Run `openspec status --change introduce-db-worker-abstraction` and confirm artifacts/tasks remain valid.
