## ADDED Requirements

### Requirement: orderDeleteChanges server helper

The `packages/baresync/src/server/service.ts` module SHALL export `orderDeleteChanges(input)` that accepts `changes` (per-table change objects) and `order` (the upsert order from contract), and returns changes sorted in **reverse** order (child-before-parent for safe deletes).

#### Scenario: Delete changes reversed from upsert order

- **WHEN** `orderDeleteChanges` receives changes for `categories` then `products`, and `order` is `["categories", "products"]`
- **THEN** the result SHALL list products before categories

#### Scenario: Unknown delete tables placed last

- **WHEN** a change exists for a table not in the order
- **THEN** that table's changes SHALL appear after all ordered tables

### Requirement: Sync cursor server helpers

The `packages/baresync/src/server/service.ts` module SHALL export `parseSyncCursor` and `formatSyncCursor` for cursor parsing and formatting using the `"sync:timestamp:tableName:rowId"` wire format.

#### Scenario: Cursor parsed and formatted roundtrip

- **WHEN** a cursor is formatted and then parsed
- **THEN** the original values SHALL be recovered

### Requirement: Sync error mapping helper

The `packages/baresync/src/server/service.ts` module SHALL export `mapSyncError(error)` that maps sync-related errors to stable error codes.

#### Scenario: Conflict error mapped to idempotency conflict

- **WHEN** `mapSyncError` receives a `ConflictRequestError`
- **THEN** the result SHALL have `code: "sync_idempotency_conflict"`

### Requirement: Push row counting helper

The `packages/baresync/src/server/service.ts` module SHALL export `countPushRows(body)` for counting total rows across all tables.

#### Scenario: Empty body returns zero

- **WHEN** `countPushRows` is called with a body that has no tables
- **THEN** the result SHALL be 0
