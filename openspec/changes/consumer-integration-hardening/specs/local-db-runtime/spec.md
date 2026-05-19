## ADDED Requirements

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
