## MODIFIED Requirements

### Requirement: Migration directory execution

The `crates/baresync-core/src/migrations.rs` module SHALL export `run_migration_files(db, config, dir)` that collects `.sql` files from a directory, reads each file, and applies them with the same tracking, ordering, statement splitting, and transaction semantics as embedded migrations through a `rusqlite` worker-backed `DbClient`.

#### Scenario: Directory migrations apply in filename order

- **WHEN** a migration directory contains `0002_insert.sql` and `0001_create.sql`
- **THEN** `run_migration_files` SHALL execute `0001_create` before `0002_insert`

#### Scenario: Directory migration records use file stems

- **WHEN** `run_migration_files` applies `0001_create_items.sql`
- **THEN** `__drizzle_migrations.hash` SHALL store `0001_create_items`

### Requirement: Transactional migration execution

Each migration SHALL execute within a transaction on the `rusqlite` worker. SQL statements SHALL be split by `--> statement-breakpoint`. If any statement fails in strict mode, the transaction SHALL roll back and no migration record SHALL be written. If any statement fails in tolerant mode, errors matching `"already exists"` or `"duplicate column"` SHALL be silently skipped.

#### Scenario: Successful migration recorded

- **WHEN** a migration with two statements executes successfully
- **THEN** both statements SHALL be committed and the migration SHALL be recorded in `__drizzle_migrations`

#### Scenario: Failing migration rolls back in strict mode

- **WHEN** the second statement of a migration fails in strict mode
- **THEN** the first statement SHALL be rolled back and no migration record SHALL be written

#### Scenario: Tolerant mode skips already-exists

- **WHEN** a `CREATE TABLE` statement fails with "already exists" in tolerant mode
- **THEN** the error SHALL be skipped and the migration SHALL continue

#### Scenario: Tolerant mode skips duplicate column

- **WHEN** an `ALTER TABLE ADD COLUMN` statement fails with "duplicate column" in tolerant mode
- **THEN** the error SHALL be skipped and the migration SHALL continue
