## ADDED Requirements

### Requirement: Drizzle proxy plugin command defaults

The JS Drizzle proxy database helper SHALL use Baresync plugin command names by default while preserving command-name overrides.

#### Scenario: Default DB proxy command names use plugin namespace

- **WHEN** a Drizzle query is executed on a database returned by `createTauriDrizzleDatabase` without custom command-name overrides
- **THEN** the helper SHALL invoke `plugin:baresync|run_sql` or `plugin:baresync|run_sql_batch` as appropriate

#### Scenario: Legacy DB proxy command names remain configurable

- **WHEN** a consumer configures custom `runSql` or `runSqlBatch` command names
- **THEN** the helper SHALL invoke those configured command names instead of plugin namespace defaults

## MODIFIED Requirements

### Requirement: JS Drizzle proxy database helper

The `packages/baresync/src/db/drizzle-proxy.ts` module SHALL export `createTauriDrizzleDatabase(input)` that accepts a `schema` object and an optional `commands` configuration mapping `runSql` and `runSqlBatch` to Tauri command names.

The function SHALL return a Drizzle `BetterSQLite3Database` instance using the `drizzle-orm/sqlite-proxy` driver configured to invoke Baresync plugin commands by default or the specified Tauri commands when overrides are provided.

#### Scenario: Database helper invokes Tauri commands

- **WHEN** a Drizzle query is executed on the returned database instance with default command configuration
- **THEN** the corresponding Baresync plugin command (`plugin:baresync|run_sql` or `plugin:baresync|run_sql_batch`) SHALL be invoked with the serialized query

#### Scenario: Database helper supports Tauri invoke directly

- **WHEN** a Tauri app passes `@tauri-apps/api/core` `invoke` to `createTauriDrizzleDatabase`
- **THEN** the helper SHALL accept it without requiring an app-local type assertion
