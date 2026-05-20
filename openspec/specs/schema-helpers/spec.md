## ADDED Requirements

### Requirement: Supported sync column helper functions

The `packages/baresync/src/schema/row-state.ts` module SHALL export `localSyncColumns()` and `apiSyncColumns()` helper functions for the supported Drizzle table shape.

`localSyncColumns()` SHALL return column definitions for:

- `deletedAt`: `text("deleted_at")`
- `createdAt`: `text("created_at").notNull().$defaultFn(() => new Date().toISOString())`
- `updatedAt`: `text("updated_at").notNull().$defaultFn(() => new Date().toISOString())`
- `isSynced`: `integer("is_synced", { mode: "boolean" }).notNull().default(false)`

`apiSyncColumns()` SHALL return column definitions for:

- `deletedAt`: `text("deleted_at")`
- `createdAt`: `text("created_at").notNull()`
- `updatedAt`: `text("updated_at").notNull()`
- `syncUpdatedAt`: `integer("sync_updated_at", { mode: "number" }).notNull()`

#### Scenario: Local sync columns integrate into a Drizzle table

- **WHEN** a consumer spreads `localSyncColumns()` into an `sqliteTable` definition
- **THEN** the resulting table has `deleted_at`, `created_at`, `updated_at`, and `is_synced` columns with the supported local sync shape

#### Scenario: API sync columns integrate into a Drizzle table

- **WHEN** a consumer spreads `apiSyncColumns()` into an `sqliteTable` definition
- **THEN** the resulting table has `deleted_at`, `created_at`, `updated_at`, and `sync_updated_at` columns with the supported API sync shape

### Requirement: defineSyncedTable for explicit metadata

The `packages/baresync/src/schema/synced-table.ts` module SHALL export `defineSyncedTable(input)` that accepts:

- `table`: a Drizzle `sqliteTable` instance
- `scope`: an object with `source: "scope"`, `field: string` (the JS property name), and `column` (the Drizzle column reference)
- Optional `localOnlyColumns`: array of column names excluded from server sync
- Optional `serverOnlyColumns`: array of column names excluded from local schema

The function SHALL return a `SyncedTableDefinition` object containing the table, scope metadata, and column exclusions.

#### Scenario: defineSyncedTable with valid scope

- **WHEN** `defineSyncedTable` is called with a table that has a `merchantId` column and `scope: { source: "scope", field: "merchantId", column: table.merchantId }`
- **THEN** the returned definition contains the table, scope metadata with `field: "merchantId"`, and no column exclusions

#### Scenario: defineSyncedTable with local-only columns

- **WHEN** `defineSyncedTable` is called with `localOnlyColumns: ["isSynced"]`
- **THEN** the returned definition records `"isSynced"` as excluded from server sync

### Requirement: syncedTable shorthand

The `packages/baresync/src/schema/synced-table.ts` module SHALL export `syncedTable(table, options)` as a shorthand for `defineSyncedTable` where `options` contains just `scope` and optional column exclusions.

#### Scenario: syncedTable produces equivalent output to defineSyncedTable

- **WHEN** `syncedTable(table, { scope: "merchant" })` is called
- **THEN** the result is structurally equivalent to calling `defineSyncedTable` with the same table and scope metadata

### Requirement: defineSyncContract for contract definition

The `packages/baresync/src/schema/contract.ts` module SHALL export `defineSyncContract(input)` that accepts:

- `encoding`: `"json" | "protobuf"`
- `packageName`: a dot-separated namespace string (e.g., `"example.sync.v1"`)
- `tables`: an array of `SyncedTableDefinition` objects
- Optional `limits` object with `maxPushBytes` and `maxPushRows`

The function SHALL return a `SyncContract` object.

#### Scenario: defineSyncContract with JSON encoding

- **WHEN** `defineSyncContract` is called with `encoding: "json"`, a `packageName`, and at least one table
- **THEN** a `SyncContract` object is returned with the specified encoding, package name, tables, and limits

#### Scenario: defineSyncContract with protobuf encoding

- **WHEN** `defineSyncContract` is called with `encoding: "protobuf"`, a `packageName`, and at least one table
- **THEN** a `SyncContract` object is returned with `encoding: "protobuf"`
- **AND** the same structural validation rules still apply

### Requirement: syncSchema batteries-included shorthand

The `packages/baresync/src/schema/contract.ts` module SHALL export `syncSchema(input)` as a shorthand that calls `defineSyncContract` with default limits.

#### Scenario: syncSchema uses default JSON encoding

- **WHEN** `syncSchema` is called without an `encoding` property
- **THEN** the resulting contract uses `encoding: "json"`
- **AND** the resulting contract uses `maxPushBytes: 2097152` and `maxPushRows: 2000`

#### Scenario: syncSchema accepts protobuf encoding

- **WHEN** `syncSchema` is called with `encoding: "protobuf"`
- **THEN** the resulting contract preserves `encoding: "protobuf"`

### Requirement: Structural validation of synced tables

The `defineSyncContract` function SHALL validate that every synced table has:

- A single primary key column named `id` of type `text`
- A configured scope column that maps to a real column in the table
- A `deletedAt` column (for soft deletes)
- For local-side tables: an `isSynced` column
- For server-side tables: a `syncUpdatedAt` column

If any validation fails, the function SHALL throw a descriptive error naming the table and the missing or invalid column.

#### Scenario: Missing primary key fails validation

- **WHEN** `defineSyncContract` is called with a table that has no `id` primary key
- **THEN** an error is thrown identifying the table and stating the primary key is missing

#### Scenario: Missing scope column fails validation

- **WHEN** `defineSyncContract` is called with a table whose scope field does not map to an existing column
- **THEN** an error is thrown identifying the table, the scope field, and stating the column is missing

#### Scenario: Missing deletedAt column fails validation

- **WHEN** `defineSyncContract` is called with a table that has no `deletedAt` column
- **THEN** an error is thrown identifying the table and stating `deletedAt` is missing

### Requirement: Library-managed server schema export

The `packages/baresync/src/schema/index.ts` module SHALL export `syncServerSchema` containing the `syncBatchRequests` table definition for library-managed idempotency storage.

#### Scenario: syncServerSchema is importable

- **WHEN** a consumer imports `syncServerSchema` from `baresync/schema`
- **THEN** the import resolves and contains a `syncBatchRequests` table definition
