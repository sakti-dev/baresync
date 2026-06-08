## MODIFIED Requirements

### Requirement: Drizzle repository pull responses

The returned repository SHALL provide `loadPullChanges({ cursor, scopeId, tables })` that builds a pull response from configured Drizzle tables.

The helper SHALL parse the input cursor, call each table config's `readRows` for the given scope, and, for incremental pulls, use a cursor timestamp derived from the input cursor.

Successful pull responses SHALL always return a non-empty cursor. If at least one configured table has rows for the scope, the cursor SHALL be formatted from the latest row across all configured tables. If no configured table has rows for the scope, the cursor SHALL be a synthetic server watermark cursor using the response observation timestamp.

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

#### Scenario: Pull response formats latest row cursor

- **WHEN** at least one configured table has rows for the scope
- **THEN** the response cursor SHALL be formatted from the latest row across all configured tables
- **AND** the response cursor SHALL NOT be empty

#### Scenario: Pull response formats watermark cursor when no rows exist

- **WHEN** no configured table has rows for the scope
- **THEN** the response cursor SHALL be a non-empty synthetic server watermark cursor
- **AND** the response cursor SHALL parse with table name `"__watermark__"` and row id `"__scope__"`

#### Scenario: Pull response has no pagination

- **WHEN** `loadPullChanges` returns a response
- **THEN** `hasMore` SHALL be `false`
- **AND** `serverTime` SHALL be set

### Requirement: Drizzle repository status responses

The returned repository SHALL provide `loadSyncStatus({ cursor, scopeId })` that reports changed tables since the cursor.

Successful status responses SHALL always return a non-empty cursor. If at least one configured table has rows for the scope, the cursor SHALL be formatted from the latest row across all configured tables. If no configured table has rows for the scope, the cursor SHALL be a synthetic server watermark cursor using the response observation timestamp.

#### Scenario: Status response reports changed tables

- **WHEN** selected incremental rows include changed rows or deleted IDs for a configured table
- **THEN** `changedTables` SHALL include that table name
- **AND** `hasChanges` SHALL be `true`

#### Scenario: Status response reports no changes

- **WHEN** no configured table has changed rows or deleted IDs since the cursor
- **THEN** `changedTables` SHALL be empty
- **AND** `hasChanges` SHALL be `false`

#### Scenario: Status response formats latest row cursor

- **WHEN** `loadSyncStatus` returns a response and at least one configured table has rows for the scope
- **THEN** `cursor` SHALL be formatted from the latest row across all configured tables
- **AND** `cursor` SHALL NOT be empty
- **AND** `serverTime` SHALL be set

#### Scenario: Status response formats watermark cursor when no rows exist

- **WHEN** `loadSyncStatus` returns a response and no configured table has rows for the scope
- **THEN** `cursor` SHALL be a non-empty synthetic server watermark cursor
- **AND** `cursor` SHALL parse with table name `"__watermark__"` and row id `"__scope__"`
- **AND** `serverTime` SHALL be set
