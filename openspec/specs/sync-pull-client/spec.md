## MODIFIED Requirements

### Requirement: Generic pull engine with JSON decoding

The `crates/baresync-core/src/pull.rs` module SHALL export a `pull` function that accepts a `DbClient`, a `SyncEngineConfig`, sync contract metadata, a `PullStartCursor` enum, and an optional table filter.

The pull engine SHALL:
1. Resolve the start cursor from `PullStartCursor`: `Baseline` uses empty string, `Stored` reads from `sync_cursors`
2. Send a POST request to `{api_url}/pull` with a body containing `scopeId`, `tables` (from contract `upsert_order` or the table filter), `limit`, and `cursor`
3. Encode the request and decode the response according to `SyncEngineConfig.encoding`
4. Apply upserts in `upsert_order` (parent before child)
5. Apply soft deletes in `delete_order` (child before parent)
6. If using `PullStartCursor::Stored`, advance the cursor in `sync_cursors`
7. If using `PullStartCursor::Baseline`, do NOT advance the main cursor (reconciliation pull)
8. Return a `PullResult` with `rows_received` and `server_time`

#### Scenario: Baseline pull with empty cursor

- **WHEN** `PullStartCursor::Baseline` is used
- **THEN** the pull request sends an empty cursor string and receives all rows for the scope

#### Scenario: Incremental pull with stored cursor

- **WHEN** `PullStartCursor::Stored` is used and a cursor `"sync:1716120000000:products:prod-42"` exists
- **THEN** the pull request sends that cursor and receives only rows changed after the watermark

#### Scenario: Pull with stored cursor when no cursor exists

- **WHEN** `PullStartCursor::Stored` is used and no cursor exists in `sync_cursors`
- **THEN** the pull request sends an empty cursor string

#### Scenario: Pull applies upserts in FK order

- **WHEN** the pull response contains rows for products and categories
- **THEN** categories are upserted before products (matching `upsert_order`)

#### Scenario: Pull applies soft deletes in reverse FK order

- **WHEN** the pull response contains `deletedIds` for categories and products
- **THEN** products are soft-deleted before categories (matching `delete_order`)

#### Scenario: Reconciliation pull does not advance cursor

- **WHEN** `PullStartCursor::Baseline` is used (reconciliation pull for rejected tables)
- **THEN** the main cursor in `sync_cursors` SHALL NOT be updated

#### Scenario: Pull with table filter

- **WHEN** a table filter `["categories", "products"]` is provided
- **THEN** only those tables SHALL be included in the pull request

#### Scenario: JSON pull uses POST body

- **WHEN** the engine is configured with `encoding: "json"` and pull is called
- **THEN** the runtime SHALL send a POST request body containing `scopeId`, `tables`, `limit`, and `cursor`
- **AND** the response SHALL be decoded as JSON

### Requirement: Soft delete application

The pull engine SHALL apply soft deletes by setting `deleted_at`, `updated_at`, and `is_synced = 1` on the local row.

#### Scenario: Soft delete marks row and sets synced

- **WHEN** the pull response contains `deletedIds: ["cat-1"]`
- **THEN** the local row with `id = "cat-1"` has `deleted_at` set to the server time, `updated_at` set to the server time, and `is_synced = 1`

### Requirement: Cursor storage and advancement

The pull engine SHALL store the cursor in a `sync_cursors` table keyed by `scope_id`. After applying all rows, the cursor from the response SHALL be written, overwriting the previous value.

#### Scenario: Cursor advances after successful pull

- **WHEN** a pull response returns cursor `"sync:1716123600000:products:prod-99"`
- **THEN** `sync_cursors` for the scope_id is updated to that value

#### Scenario: Cursor does not advance on failure

- **WHEN** row application fails mid-way through a pull
- **THEN** the cursor is not updated and remains at the previous value

### Requirement: Runtime status request

The runtime transport SHALL support a status request that sends `scopeId` and `cursor` to `{api_url}/status` and decodes a response containing `changedTables`, `hasChanges`, `cursor`, and `serverTime`.

#### Scenario: JSON status request

- **WHEN** the engine is configured with `encoding: "json"` and status is requested
- **THEN** the runtime SHALL send a POST JSON body containing `scopeId` and `cursor`
- **AND** the response SHALL be decoded from JSON

### Requirement: Pull response JSON shape

The pull engine SHALL expect a JSON response with this structure:

```json
{
  "cursor": "<non-empty watermark string>",
  "hasMore": false,
  "serverTime": "<ISO timestamp>",
  "tables": [
    {
      "table": "<table_name>",
      "changedRows": [ { ...row data in camelCase } ],
      "deletedIds": [ "<row_id>" ]
    }
  ]
}
```

Row data SHALL be converted from camelCase to snake_case for local SQLite column names. Columns listed in the contract's `localOnlyColumns` SHALL be added with default values (`is_synced = 1`) during upsert.

#### Scenario: Pull response rows are converted to snake_case

- **WHEN** the response contains `"merchantId": "m-1"`
- **THEN** the local upsert uses column name `merchant_id` with value `"m-1"`

#### Scenario: Synced rows get is_synced = 1

- **WHEN** a row is upserted from a pull response
- **THEN** the `is_synced` column is set to `1` regardless of whether it was in the response

#### Scenario: Same table can include upserts and soft-deletes

- **WHEN** a pull response includes both `changedRows` and `deletedIds` for the same table
- **THEN** the changed rows SHALL be upserted
- **AND** the deleted rows SHALL be soft-deleted
