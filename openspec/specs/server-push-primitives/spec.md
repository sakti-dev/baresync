## ADDED Requirements

### Requirement: JSON sync request decoding

The `packages/baresync/src/server/service.ts` module SHALL export `decodeSyncRequest(input)` that accepts an object with `encoding`, `kind` (`"push"` or `"pull"`), and a `Request` object, and returns a decoded request body.

For `encoding: "json"`, the function SHALL parse the request body as JSON and validate that required fields exist based on the kind:

- **push**: `scopeId`, `clientId`, `idempotencyKey`, `tables` (array)
- **pull**: `scopeId`, `tables` (array), `cursor`, `limit`

#### Scenario: Valid JSON push request is decoded

- **WHEN** `decodeSyncRequest` is called with `encoding: "json"`, `kind: "push"`, and a Request whose body is a valid JSON push envelope
- **THEN** the decoded result contains `body` with `scopeId`, `clientId`, `idempotencyKey`, and `tables`

#### Scenario: Missing required field returns error

- **WHEN** `decodeSyncRequest` is called with a push request missing `clientId`
- **THEN** an error is thrown identifying the missing field

### Requirement: JSON sync response encoding

The `packages/baresync/src/server/service.ts` module SHALL export `encodeSyncResponse(input)` that accepts `body`, `encoding`, and `kind`, and returns a `Response` with the appropriate `Content-Type`.

For `encoding: "json"`, the response SHALL have `Content-Type: application/json` and the body serialized as JSON.

#### Scenario: JSON push response is encoded

- **WHEN** `encodeSyncResponse` is called with `encoding: "json"`, `kind: "push"`, and a response body
- **THEN** the returned Response has `Content-Type: application/json` and the body is the JSON-serialized content

### Requirement: Push envelope validation

The `packages/baresync/src/server/service.ts` module SHALL export `validatePushEnvelope(decoded, limits)` that validates:

- Total byte size of the request body does not exceed `limits.maxBytes`
- Total row count (sum of `changedRows.length + deletedIds.length` across all tables) does not exceed `limits.maxRows`

#### Scenario: Oversized push returns payload_too_large

- **WHEN** a push request exceeds `maxBytes`
- **THEN** `validatePushEnvelope` throws an error with `kind: "payload_too_large"`

#### Scenario: Row count overflow returns payload_too_large

- **WHEN** a push request has more rows than `maxRows`
- **THEN** `validatePushEnvelope` throws an error with `kind: "payload_too_large"`

#### Scenario: Valid push passes validation

- **WHEN** a push request is within both byte and row limits
- **THEN** `validatePushEnvelope` returns without error

### Requirement: Push table ordering helper

The `packages/baresync/src/server/service.ts` module SHALL export `orderPushChanges(input)` that accepts `changes` (an array of per-table change objects) and `order` (the `upsertOrder` from the contract), and returns the changes sorted to match the order.

#### Scenario: Changes are reordered to match FK order

- **WHEN** `orderPushChanges` receives changes for `products` then `categories`, and `order` is `["categories", "products"]`
- **THEN** the result lists categories before products

#### Scenario: Unknown tables are placed last

- **WHEN** a change exists for a table not in the order
- **THEN** that table's changes appear after all ordered tables

### Requirement: DB bind-parameter chunking utilities

The `packages/baresync/src/server/chunking.ts` module SHALL export:

- `SQLITE_BIND_PARAM_LIMIT`: `32766`
- `SAFE_SQLITE_BIND_PARAM_LIMIT`: `30000`
- `DEFAULT_MAX_ROWS_PER_WRITE_CHUNK`: `500`
- `DEFAULT_MAX_IDS_PER_READ_CHUNK`: `1000`
- `getWriteChunkSize(input)`: returns `min(maxRowsPerChunk, floor(maxBindParams / columnCount))`
- `chunkArray<T>(rows, chunkSize)`: splits array into chunks

#### Scenario: Write chunk size respects bind parameter budget

- **WHEN** `getWriteChunkSize` is called with `columnCount: 10` and default bind params
- **THEN** the result is `min(500, floor(30000 / 10))` = `500`

#### Scenario: Write chunk size clamps to bind limit for wide tables

- **WHEN** `getWriteChunkSize` is called with `columnCount: 100` and default bind params
- **THEN** the result is `min(500, floor(30000 / 100))` = `300`

#### Scenario: chunkArray splits correctly

- **WHEN** `chunkArray` is called with 5 items and chunkSize 2
- **THEN** the result is `[[a, b], [c, d], [e]]`

## MODIFIED Requirements

### Requirement: decodeSyncRequest

The `decodeSyncRequest` function SHALL accept a `{ encoding, kind, request }` input, parse the request body as JSON, validate required fields for the given kind ("push" or "pull"), compute SHA-256 of the raw request body, and return `{ body, requestHash }`.

#### Scenario: Push request decoded with request hash

- **WHEN** a JSON push request is decoded
- **THEN** the returned `requestHash` SHALL be the SHA-256 hex digest of the serialized request body

#### Scenario: Missing required push field throws

- **WHEN** a push request body is missing `scopeId`, `clientId`, `idempotencyKey`, or `tables`
- **THEN** an error SHALL be thrown identifying the missing field

#### Scenario: Missing required pull field throws

- **WHEN** a pull request body is missing `scopeId`, `tables`, or `cursor`
- **THEN** an error SHALL be thrown identifying the missing field
