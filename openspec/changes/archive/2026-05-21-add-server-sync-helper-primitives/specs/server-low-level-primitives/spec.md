## ADDED Requirements

### Requirement: Cursor timestamp helper

The `baresync/server` export path SHALL provide `parseSyncCursorTimestamp(cursor: string)` that returns the `syncUpdatedAt` timestamp from a valid sync cursor and returns `0` for an empty cursor.

#### Scenario: Empty cursor returns zero timestamp

- **WHEN** `parseSyncCursorTimestamp` is called with an empty string
- **THEN** it SHALL return `0`

#### Scenario: Valid cursor returns timestamp

- **WHEN** `parseSyncCursorTimestamp` is called with `"sync:1700000000:items:item-1"`
- **THEN** it SHALL return `1700000000`

#### Scenario: Invalid cursor still fails

- **WHEN** `parseSyncCursorTimestamp` is called with an invalid cursor string
- **THEN** it SHALL throw the same class of descriptive cursor error as `parseSyncCursor`

### Requirement: Sync row splitting helper

The `baresync/server` export path SHALL provide `splitSyncRows(rows)` for rows with `id`, `deletedAt`, and `syncUpdatedAt` fields.

Rows with `deletedAt === null` SHALL be returned in `changedRows` with `syncUpdatedAt` omitted. Rows with a non-null `deletedAt` SHALL contribute their `id` to `deletedIds`.

#### Scenario: Changed rows omit internal sync timestamp

- **WHEN** `splitSyncRows` receives a row with `deletedAt: null` and `syncUpdatedAt`
- **THEN** the returned `changedRows` entry SHALL include the row data except `syncUpdatedAt`
- **AND** `deletedIds` SHALL be empty

#### Scenario: Deleted rows become deleted IDs

- **WHEN** `splitSyncRows` receives a row with a non-null `deletedAt`
- **THEN** the returned `deletedIds` SHALL contain that row's `id`
- **AND** the row SHALL NOT appear in `changedRows`

### Requirement: Pull table response helper

The `baresync/server` export path SHALL provide `buildPullTables(input)` that creates pull table response entries from known table names, requested table names, and per-table change buckets.

When `requestedTables` is empty, the helper SHALL return entries for every table in `allTables`. When `requestedTables` is non-empty, the helper SHALL return entries only for requested names that exist in `allTables`, preserving the request order for known tables.

#### Scenario: Empty requested table list returns all known tables

- **WHEN** `buildPullTables` is called with `allTables: ["locations", "items"]` and `requestedTables: []`
- **THEN** it SHALL return pull entries for `locations` and `items`

#### Scenario: Requested table list filters known tables

- **WHEN** `buildPullTables` is called with `requestedTables: ["items"]`
- **THEN** it SHALL return a pull entry for `items`
- **AND** it SHALL NOT return an entry for `locations`

#### Scenario: Unknown requested tables are ignored

- **WHEN** `buildPullTables` is called with `requestedTables` containing a name not present in `allTables`
- **THEN** the unknown table SHALL NOT appear in the returned pull table entries

### Requirement: Changed table name helper

The `baresync/server` export path SHALL provide `changedTableNames(input)` that returns known table names whose change bucket contains at least one changed row or deleted ID.

#### Scenario: Changed rows mark table changed

- **WHEN** a table change bucket contains one or more `changedRows`
- **THEN** `changedTableNames` SHALL include that table name

#### Scenario: Deleted IDs mark table changed

- **WHEN** a table change bucket contains one or more `deletedIds`
- **THEN** `changedTableNames` SHALL include that table name

#### Scenario: Empty buckets are omitted

- **WHEN** a table change bucket has no changed rows and no deleted IDs
- **THEN** `changedTableNames` SHALL omit that table name

### Requirement: Sync table validation helper

The `baresync/server` export path SHALL provide `validateSyncTable(table, allowedTables)` that returns the table name narrowed to the allowed table union when it is known and throws a descriptive error when it is unknown.

#### Scenario: Known table is returned

- **WHEN** `validateSyncTable` is called with `"items"` and allowed tables `["locations", "items"]`
- **THEN** it SHALL return `"items"`

#### Scenario: Unknown table throws

- **WHEN** `validateSyncTable` is called with `"unknown"` and allowed tables `["locations", "items"]`
- **THEN** it SHALL throw an error that identifies the unsupported table name

### Requirement: Latest cursor formatting helper

The `baresync/server` export path SHALL provide `formatLatestSyncCursor(row)` that accepts `{ id, tableName, syncUpdatedAt }` and returns a cursor using the existing sync cursor format.

#### Scenario: Latest cursor row is formatted

- **WHEN** `formatLatestSyncCursor` is called with `{ id: "item-1", tableName: "items", syncUpdatedAt: 1700000000 }`
- **THEN** it SHALL return `"sync:1700000000:items:item-1"`
