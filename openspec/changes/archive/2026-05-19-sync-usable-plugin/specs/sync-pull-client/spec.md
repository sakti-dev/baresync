## MODIFIED Requirements

### Requirement: Generic pull engine with JSON decoding

The `crates/baresync-core/src/pull.rs` module SHALL export a `pull` function that accepts a `SqlitePool`, a `SyncEngineConfig`, a `SyncContract`, a `PullStartCursor` enum, and an optional table filter.

The pull engine SHALL:
1. Resolve the start cursor from `PullStartCursor`: `Baseline` uses empty string, `Stored` reads from `sync_cursors`
2. Send a GET request to `{api_url}/sync/pull` with query parameters `scopeId`, `tables` (from contract `upsert_order` or the table filter), `limit`, and `cursor`
3. Parse the JSON response
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
