## ADDED Requirements

### Requirement: Sync request decoding and request hashing

The `packages/baresync/src/server/service.ts` module SHALL export `decodeSyncRequest(input)` that accepts an object with `encoding`, `kind` (`"push"` or `"pull"`), a protobuf schema descriptor when `encoding` is `"protobuf"`, and a `Request` object, decodes the request body according to the selected encoding, validates required fields for the request kind, and returns `{ body, requestHash }`.

For JSON requests, the body SHALL be parsed as JSON.
For protobuf requests, the body SHALL be decoded from `application/x-protobuf` wire bytes using generated table and row message metadata.
The returned `requestHash` SHALL be the SHA-256 hash of the raw request body bytes.

#### Scenario: JSON push request is decoded

- **WHEN** `decodeSyncRequest` is called with `encoding: "json"`, `kind: "push"`, and a valid JSON request body
- **THEN** the decoded body SHALL contain the push envelope fields
- **AND** the returned `requestHash` SHALL be computed from the raw JSON request bytes

#### Scenario: Protobuf push request is decoded

- **WHEN** `decodeSyncRequest` is called with `encoding: "protobuf"`, `kind: "push"`, and a valid protobuf request body
- **THEN** the decoded body SHALL contain the push envelope fields
- **AND** the returned `requestHash` SHALL be computed from the raw protobuf wire bytes

### Requirement: Sync response encoding

The `packages/baresync/src/server/service.ts` module SHALL export `encodeSyncResponse(input)` that accepts `body`, `encoding`, `kind`, and a protobuf schema descriptor when `encoding` is `"protobuf"`, and returns a `Response` with the appropriate `Content-Type`.

For JSON, the response SHALL have `Content-Type: application/json` and the body serialized as JSON.
For protobuf, the response SHALL have `Content-Type: application/x-protobuf` and the body serialized with generated protobuf row and table messages.

#### Scenario: Protobuf request body is row-typed

- **WHEN** `decodeSyncRequest` is called with `encoding: "protobuf"`, `kind: "push"`, a protobuf schema descriptor, and a valid protobuf request body
- **THEN** the decoded body SHALL contain the push envelope fields
- **AND** each changed row SHALL decode as a typed protobuf row object, not a JSON string payload
- **AND** the returned `requestHash` SHALL be computed from the raw protobuf wire bytes

#### Scenario: JSON response is encoded

- **WHEN** `encodeSyncResponse` is called with `encoding: "json"`, `kind: "push"`, and a response body
- **THEN** the response SHALL use `Content-Type: application/json`

#### Scenario: Protobuf response is encoded

- **WHEN** `encodeSyncResponse` is called with `encoding: "protobuf"`, `kind: "pull"`, a protobuf schema descriptor, and a response body
- **THEN** the response SHALL use `Content-Type: application/x-protobuf`

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

#### Scenario: Delete-only body counts deletedIds

- **WHEN** `countPushRows` is called with a body that has one table containing only `deletedIds`
- **THEN** the result SHALL equal the number of deleted IDs
