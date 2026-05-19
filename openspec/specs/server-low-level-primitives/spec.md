## ADDED Requirements

### Requirement: Sync cursor parsing

The `packages/baresync/src/server/service.ts` module SHALL export `parseSyncCursor(cursor: string)` that parses the `"sync:timestamp:tableName:rowId"` format and returns `{ syncUpdatedAt: number, tableName: string, rowId: string }` or `null` for empty cursors. Invalid cursors SHALL throw an error with a descriptive message.

#### Scenario: Valid cursor parsed

- **WHEN** `parseSyncCursor` is called with `"sync:1700000000:products:abc-123"`
- **THEN** the result SHALL be `{ syncUpdatedAt: 1700000000, tableName: "products", rowId: "abc-123" }`

#### Scenario: Empty cursor returns null

- **WHEN** `parseSyncCursor` is called with `""`
- **THEN** the result SHALL be `null`

#### Scenario: Invalid cursor throws

- **WHEN** `parseSyncCursor` is called with `"invalid"`
- **THEN** an error SHALL be thrown

#### Scenario: Non-numeric timestamp throws

- **WHEN** `parseSyncCursor` is called with `"sync:notanumber:products:abc"`
- **THEN** an error SHALL be thrown

### Requirement: Sync cursor formatting

The `packages/baresync/src/server/service.ts` module SHALL export `formatSyncCursor(input)` that accepts `{ syncUpdatedAt, tableName, rowId }` and returns the `"sync:timestamp:tableName:rowId"` string.

#### Scenario: Cursor formatted

- **WHEN** `formatSyncCursor` is called with `{ syncUpdatedAt: 1700000000, tableName: "products", rowId: "abc-123" }`
- **THEN** the result SHALL be `"sync:1700000000:products:abc-123"`

### Requirement: Delete table ordering helper

The `packages/baresync/src/server/service.ts` module SHALL export `orderDeleteChanges(input)` that accepts `changes` and `order`, and returns changes sorted in **reverse** of the upsert order (child tables before parent tables).

#### Scenario: Deletes ordered child-before-parent

- **WHEN** `orderDeleteChanges` receives changes for `categories` then `products`, and `order` is `["categories", "products"]`
- **THEN** the result SHALL list products before categories

#### Scenario: Unknown tables placed last in delete order

- **WHEN** a change exists for a table not in the order
- **THEN** that table's changes SHALL appear after all ordered tables

### Requirement: Sync error mapping

The `packages/baresync/src/server/service.ts` module SHALL export `mapSyncError(error: unknown)` that maps errors to stable error codes: `sync_unauthorized` (401), `sync_payload_too_large` (413), `sync_idempotency_conflict` (409), `sync_cursor_invalid` (400 with cursor), `sync_scope_invalid` (403/404), `sync_network_error` (fetch failures), `sync_unknown` (unrecognized).

#### Scenario: HTTP 413 mapped

- **WHEN** `mapSyncError` receives an error with HTTP status 413
- **THEN** the result SHALL have `code: "sync_payload_too_large"`

#### Scenario: Network failure mapped

- **WHEN** `mapSyncError` receives a TypeError (network failure)
- **THEN** the result SHALL have `code: "sync_network_error"`

#### Scenario: Unknown error mapped

- **WHEN** `mapSyncError` receives an unrecognized error
- **THEN** the result SHALL have `code: "sync_unknown"` and include the original message

### Requirement: Push row counting

The `packages/baresync/src/server/service.ts` module SHALL export `countPushRows(body)` that counts total rows across all tables in a push request body (sum of `changedRows.length + deletedIds.length`).

#### Scenario: Rows counted across multiple tables

- **WHEN** `countPushRows` is called with a body containing two tables with 3 changedRows + 2 deletedIds and 5 changedRows + 1 deletedIds
- **THEN** the result SHALL be 11
