## MODIFIED Requirements

### Requirement: Generic pull engine with JSON decoding

The `crates/baresync-core/src/pull.rs` module SHALL export a `pull` function that accepts a `DbClient`, a `SyncEngineConfig`, sync contract metadata, a `PullStartCursor` enum, and an optional table filter.

The pull engine SHALL:
1. Resolve the start cursor from `PullStartCursor`: `Baseline` uses empty string, `Stored` reads from `sync_cursors`
2. Send a POST request to `{api_url}/pull` with a body containing `scopeId`, `tables` (from contract `upsert_order` or the table filter), `limit`, and `cursor`
3. Encode the request and decode the response according to `SyncEngineConfig.encoding`
4. Apply upserts in `upsert_order` (parent before child)
5. Apply soft deletes in `delete_order` (child before parent)
6. If using `PullStartCursor::Stored`, advance the cursor in `sync_cursors` after successful local application when the response cursor is non-empty
7. If using `PullStartCursor::Baseline` and no cursor is stored for the scope, initialize the cursor in `sync_cursors` after successful local application when the response cursor is non-empty
8. If using `PullStartCursor::Baseline` and a cursor is already stored for the scope, do NOT advance or overwrite the stored cursor
9. Return a `PullResult` with `rows_received` and `server_time`

#### Scenario: Baseline pull with empty request cursor

- **WHEN** `PullStartCursor::Baseline` is used
- **THEN** the pull request sends an empty cursor string and receives all rows for the requested scope and tables

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

#### Scenario: Initial baseline pull initializes cursor

- **WHEN** `PullStartCursor::Baseline` is used, no cursor exists in `sync_cursors`, local application succeeds, and the pull response cursor is `"sync:1716123600000:products:prod-99"`
- **THEN** `sync_cursors` for the scope_id SHALL be set to `"sync:1716123600000:products:prod-99"`

#### Scenario: Reconciliation pull does not advance cursor

- **WHEN** `PullStartCursor::Baseline` is used and a cursor already exists in `sync_cursors`
- **THEN** the main cursor in `sync_cursors` SHALL NOT be updated

#### Scenario: Baseline cursor is not stored when apply fails

- **WHEN** `PullStartCursor::Baseline` is used, no cursor exists in `sync_cursors`, and row application fails
- **THEN** no response cursor SHALL be stored for the scope

#### Scenario: Pull with table filter

- **WHEN** a table filter `["categories", "products"]` is provided
- **THEN** only those tables SHALL be included in the pull request

#### Scenario: JSON pull uses POST body

- **WHEN** the engine is configured with `encoding: "json"` and pull is called
- **THEN** the runtime SHALL send a POST request body containing `scopeId`, `tables`, `limit`, and `cursor`
- **AND** the response SHALL be decoded as JSON

### Requirement: Cursor storage and advancement

The pull engine SHALL store non-empty pull response cursors in a `sync_cursors` table keyed by `scope_id` only after local row/delete application succeeds.

Stored-cursor pulls SHALL overwrite the previous cursor with the non-empty response cursor. Baseline pulls SHALL initialize the cursor only when no cursor is currently stored for the scope. Baseline pulls SHALL NOT overwrite an existing cursor.

#### Scenario: Cursor advances after successful stored-cursor pull

- **WHEN** `PullStartCursor::Stored` is used and a pull response returns cursor `"sync:1716123600000:products:prod-99"`
- **THEN** `sync_cursors` for the scope_id is updated to that value

#### Scenario: Cursor initializes after successful baseline pull

- **WHEN** `PullStartCursor::Baseline` is used, no cursor exists for the scope, and a pull response returns cursor `"sync:1716123600000:products:prod-99"`
- **THEN** `sync_cursors` for the scope_id is inserted or updated to that value

#### Scenario: Empty response cursor is not stored

- **WHEN** a pull response returns an empty cursor string
- **THEN** the pull engine SHALL NOT write that empty cursor to `sync_cursors`

#### Scenario: Cursor does not advance on failure

- **WHEN** row application fails mid-way through a pull
- **THEN** the cursor is not updated and remains at the previous value

#### Scenario: Baseline cursor does not overwrite existing cursor

- **WHEN** `PullStartCursor::Baseline` is used and the scope already has cursor `"sync:original"`
- **THEN** the cursor remains `"sync:original"` even when the pull response returns a newer non-empty cursor

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
      "changedRows": [ { "...row data in camelCase": "..." } ],
      "deletedIds": [ "<row_id>" ]
    }
  ]
}
```

For successful server responses, `cursor` SHALL be non-empty. A server may return a synthetic watermark cursor when the scope has no rows.

Row data SHALL be converted from camelCase to snake_case for local SQLite column names. Columns listed in the contract's `localOnlyColumns` SHALL be added with default values (`is_synced = 1`) during upsert.

#### Scenario: Pull response cursor is non-empty

- **WHEN** a successful pull response is returned by a compliant server
- **THEN** its `cursor` field SHALL be a non-empty string

#### Scenario: Empty scope can return synthetic watermark cursor

- **WHEN** a successful pull response contains no changed rows and no deleted IDs for any table
- **THEN** its `cursor` field SHALL still be a non-empty server watermark cursor

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
