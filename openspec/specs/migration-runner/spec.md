## ADDED Requirements

### Requirement: Deterministic migration file discovery

The `crates/baresync-core/src/migrations.rs` module SHALL export `collect_migration_files(dir)` that reads a directory, collects `.sql` files, and returns them sorted by filename in lexicographic order.

#### Scenario: SQL files sorted by name

- **WHEN** a directory contains `0002_second.sql`, `0001_first.sql`, and `README.txt`
- **THEN** only `0001_first.sql` and `0002_second.sql` SHALL be returned, in that order

#### Scenario: Non-SQL files ignored

- **WHEN** a directory contains `.txt`, `.md`, and `.sql` files
- **THEN** only `.sql` files SHALL be returned

### Requirement: Migration tracking table

The migration runner SHALL create a `__drizzle_migrations` table with columns `id` (INTEGER PRIMARY KEY AUTOINCREMENT), `hash` (TEXT NOT NULL UNIQUE), and `created_at` (INTEGER NOT NULL) if it does not exist.

#### Scenario: Tracking table created on first run

- **WHEN** migrations run against a fresh database
- **THEN** `__drizzle_migrations` SHALL exist

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

### Requirement: Idempotent migration execution

The migration runner SHALL skip migrations whose hash (name) already exists in `__drizzle_migrations`. Re-running the migration runner SHALL be a no-op for already-applied migrations.

#### Scenario: Already-applied migration skipped

- **WHEN** a migration name exists in `__drizzle_migrations`
- **THEN** that migration SHALL be skipped without executing any SQL

### Requirement: Embedded migration type

The `crates/baresync-core/src/migrations.rs` module SHALL define `EmbeddedMigration { name: &'static str, sql: &'static str }` for migrations discovered at build time via `include_str!`.

#### Scenario: Embedded migration used in runner

- **WHEN** `run_migrations` is called with `&[EmbeddedMigration { name: "0001_init", sql: "CREATE TABLE ..." }]`
- **THEN** the migration SHALL execute and be recorded

### Requirement: Migration directory execution

The `crates/baresync-core/src/migrations.rs` module SHALL export `run_migration_files(db, config, dir)` that collects `.sql` files from a directory, reads each file, and applies them with the same tracking, ordering, statement splitting, and transaction semantics as embedded migrations through a `rusqlite` worker-backed `DbClient`.

#### Scenario: Directory migrations apply in filename order

- **WHEN** a migration directory contains `0002_insert.sql` and `0001_create.sql`
- **THEN** `run_migration_files` SHALL execute `0001_create` before `0002_insert`

#### Scenario: Directory migration records use file stems

- **WHEN** `run_migration_files` applies `0001_create_items.sql`
- **THEN** `__drizzle_migrations.hash` SHALL store `0001_create_items`

### Requirement: Migration status query

The `crates/baresync-core/src/migrations.rs` module SHALL export `get_migration_status(db)` that returns the list of applied migration hashes and timestamps through a `DbClient`.

#### Scenario: Applied migrations returned

- **WHEN** `get_migration_status` is called after running 3 migrations
- **THEN** a list of 3 migration records SHALL be returned, ordered by id
