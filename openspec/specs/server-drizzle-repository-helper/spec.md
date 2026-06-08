## Purpose

Drizzle-targeted server repository helper for Baresync.

## ADDED Requirements

### Requirement: Drizzle repository helper export path

The package SHALL provide a `baresync/server/drizzle` export path for Drizzle-targeted server repository helpers.

#### Scenario: Drizzle helper exports are available

- **WHEN** a TypeScript consumer imports from `baresync/server/drizzle`
- **THEN** `createDrizzleSyncRepository`, `requiredString`, `optionalString`, and `requiredNumber` SHALL be available

### Requirement: Drizzle sync repository registry

The `createDrizzleSyncRepository` helper SHALL accept a table registry keyed by sync table name.

Each table registry entry SHALL include explicit table callbacks for `buildRow`, `readLatestRow`, `readRows`, `softDeleteRow`, and `upsertRow`.

#### Scenario: Repository exposes configured table names

- **WHEN** `createDrizzleSyncRepository` is called with a table registry
- **THEN** the returned repository SHALL expose `tableNames` containing the configured table names

#### Scenario: App owns row validation

- **WHEN** a push changed row is applied
- **THEN** the helper SHALL call that table config's `buildRow` with `{ row, scopeId, syncUpdatedAt, updatedAt }`
- **AND** the helper SHALL use the returned row for the Drizzle write

### Requirement: Drizzle repository pull responses

The returned repository SHALL provide `loadPullChanges({ cursor, scopeId, tables })` that builds a pull response from configured Drizzle tables.

The helper SHALL parse the input cursor, call each table config's `readRows` for the given scope, and, for incremental pulls, use a cursor timestamp derived from the input cursor.

#### Scenario: Pull response filters requested tables

- **WHEN** `loadPullChanges` is called with a non-empty `tables` list
- **THEN** the response SHALL include only requested tables that exist in the registry
- **AND** requested table order SHALL be preserved for known tables

#### Scenario: Pull response includes all tables by default

- **WHEN** `loadPullChanges` is called with an empty `tables` list
- **THEN** the response SHALL include every configured table

#### Scenario: Pull response splits changed rows and deleted IDs

- **WHEN** selected rows include rows with `deletedAt === null` and rows with non-null `deletedAt`
- **THEN** rows with `deletedAt === null` SHALL appear in `changedRows` without `syncUpdatedAt`
- **AND** rows with non-null `deletedAt` SHALL contribute their `id` to `deletedIds`

#### Scenario: Pull response formats cursor

- **WHEN** at least one configured table has rows for the scope
- **THEN** the response cursor SHALL be formatted from the latest row across all configured tables
- **AND** the response cursor SHALL NOT be empty
- **WHEN** no configured table has rows for the scope
- **THEN** the response cursor SHALL be a non-empty synthetic server watermark cursor

#### Scenario: Pull response has no pagination

- **WHEN** `loadPullChanges` returns a response
- **THEN** `hasMore` SHALL be `false`
- **AND** `serverTime` SHALL be set

### Requirement: Drizzle repository status responses

The returned repository SHALL provide `loadSyncStatus({ cursor, scopeId })` that reports changed tables since the cursor.

#### Scenario: Status response reports changed tables

- **WHEN** selected incremental rows include changed rows or deleted IDs for a configured table
- **THEN** `changedTables` SHALL include that table name
- **AND** `hasChanges` SHALL be `true`

#### Scenario: Status response reports no changes

- **WHEN** no configured table has changed rows or deleted IDs since the cursor
- **THEN** `changedTables` SHALL be empty
- **AND** `hasChanges` SHALL be `false`

#### Scenario: Status response formats cursor

- **WHEN** `loadSyncStatus` returns a response and at least one configured table has rows for the scope
- **THEN** `cursor` SHALL be formatted from the latest row across all configured tables
- **AND** `cursor` SHALL NOT be empty
- **WHEN** `loadSyncStatus` returns a response and no configured table has rows for the scope
- **THEN** `cursor` SHALL be a non-empty synthetic server watermark cursor
- **AND** `serverTime` SHALL be set

### Requirement: Drizzle repository push application

The returned repository SHALL provide `applyPushChanges({ changes, scopeId, syncUpdatedAt })` that applies changed rows and deleted IDs to configured Drizzle tables.

The helper SHALL validate each push table name against the registry before writing.

#### Scenario: Unknown push table is rejected

- **WHEN** `applyPushChanges` receives a change for a table not present in the registry
- **THEN** it SHALL throw a descriptive unsupported table error

#### Scenario: Changed rows are upserted

- **WHEN** `applyPushChanges` receives changed rows for a configured table
- **THEN** each changed row SHALL be mapped through that table config's `buildRow`
- **AND** the helper SHALL write the row with Drizzle `insert(...).values(...).onConflictDoUpdate(...)`

#### Scenario: Deleted IDs are soft-deleted

- **WHEN** `applyPushChanges` receives deleted IDs for a configured table
- **THEN** each ID SHALL be updated with non-null `deletedAt`, the push `syncUpdatedAt`, and the push `updatedAt`

### Requirement: Drizzle row validation helpers

The `baresync/server/drizzle` export path SHALL provide small validation helpers for explicit app-owned `buildRow` functions.

#### Scenario: Required string validates input

- **WHEN** `requiredString` receives a string value
- **THEN** it SHALL return that string
- **AND** when it receives a non-string value, it SHALL throw an error that includes the provided label

#### Scenario: Optional string validates input

- **WHEN** `optionalString` receives a string value
- **THEN** it SHALL return that string
- **AND** when it receives `null` or `undefined`, it SHALL return `null`

#### Scenario: Required number validates input

- **WHEN** `requiredNumber` receives a finite number
- **THEN** it SHALL return that number
- **AND** when it receives a non-number value, it SHALL throw an error that includes the provided label
