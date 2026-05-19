## ADDED Requirements

### Requirement: Generic pull engine with JSON decoding

The `crates/baresync-core/src/pull.rs` module SHALL export a `pull` function that accepts a `SqlitePool`, a `SyncEngineConfig`, a `SyncContract`, and optional table filter.

The pull engine SHALL:
1. Read the stored cursor from `sync_cursors` for the engine's `scope_id`
2. Send a GET request to `{api_url}/sync/pull` with query parameters `scopeId`, `tables` (from contract `upsert_order`), `limit`, and `cursor`
3. Parse the JSON response
4. Apply upserts in `upsert_order` (parent before child)
5. Apply soft deletes in `delete_order` (child before parent)
6. Advance the cursor
7. Return a `PullResult` with `rows_received` and `server_time`

#### Scenario: Baseline pull with empty cursor

- **WHEN** no cursor exists for the scope
- **THEN** the pull request sends an empty cursor string and receives all rows for the scope

#### Scenario: Incremental pull with stored cursor

- **WHEN** a cursor `"sync:1716120000000:products:prod-42"` exists
- **THEN** the pull request sends that cursor and receives only rows changed after the watermark

#### Scenario: Pull applies upserts in FK order

- **WHEN** the pull response contains rows for products and categories
- **THEN** categories are upserted before products (matching `upsert_order`)

#### Scenario: Pull applies soft deletes in reverse FK order

- **WHEN** the pull response contains `deletedIds` for categories and products
- **THEN** products are soft-deleted before categories (matching `delete_order`)

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

### Requirement: Pull response JSON shape

The pull engine SHALL expect a JSON response with this structure:

```json
{
  "cursor": "<watermark string or empty>",
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
