## ADDED Requirements

### Requirement: Generic push engine with JSON encoding

The `crates/baresync-core/src/push.rs` module SHALL export a `push` function that accepts a `SqlitePool`, a `SyncEngineConfig` (containing `scope_id`, `api_url`, `client_id`, `encoding: "json"`), and a `SyncContract` (with `upsert_order`, `delete_order`, `tables`, and `local_only_columns`).

The push engine SHALL:
1. Iterate tables in `upsert_order`
2. For each table, read unsynced outbox rows from `sync_outbox` where `scope_id` matches the engine's `scope_id`
3. Coalesce outbox operations per row (insert→update→delete collapsing)
4. Build a JSON push envelope with the canonical shape
5. Send the envelope to `{api_url}/sync/push` with `Content-Type: application/json`
6. Parse the JSON response
7. Mark accepted rows' outbox entries as synced
8. Mark accepted local rows as `is_synced = 1`
9. Return a `PushResult` with `tables_synced` and `server_time`

#### Scenario: Push sends outbox changes in FK order

- **WHEN** the outbox has pending changes for products and categories (in any order)
- **THEN** the push envelope's `tables` array lists categories before products (matching `upsert_order`)

#### Scenario: Push marks accepted outbox rows as synced

- **WHEN** the server accepts all pushed rows
- **THEN** the corresponding `sync_outbox` rows have `synced_at` set to the server time

#### Scenario: Push marks accepted local rows as synced

- **WHEN** the server accepts a row and the local row has no remaining unsynced outbox entries
- **THEN** the local row's `is_synced` is set to `1`

### Requirement: Outbox operation coalescing

The push engine SHALL coalesce multiple outbox operations for the same row:
- `insert` then `update` → `insert` (with latest payload)
- `insert` then `delete` → row removed from push entirely
- `update` then `update` → `update` (with latest payload)
- `update` then `delete` → `delete`
- `delete` then `update` → `update` (re-insert with latest payload)

#### Scenario: Insert then delete cancels the push

- **WHEN** an outbox has an `insert` followed by a `delete` for the same row ID
- **THEN** the coalesced result contains no entry for that row ID

#### Scenario: Update then delete becomes a delete

- **WHEN** an outbox has an `update` followed by a `delete` for the same row ID
- **THEN** the coalesced result contains a delete for that row ID

### Requirement: JSON push envelope construction

The push engine SHALL construct a JSON envelope with this structure:

```json
{
  "scopeId": "<engine scope_id>",
  "clientId": "<engine client_id>",
  "idempotencyKey": "<SHA-256 hash of sorted outbox IDs>",
  "tables": [
    {
      "table": "<table_name>",
      "changedRows": [ { ...row data in camelCase, excluding localOnlyColumns } ],
      "deletedIds": [ "<row_id>" ]
    }
  ]
}
```

Row data SHALL be converted from snake_case SQLite column names to camelCase for the wire format. Columns listed in the contract's `localOnlyColumns` for each table SHALL be excluded from `changedRows`.

#### Scenario: Row data uses camelCase keys

- **WHEN** a local row has column `merchant_id` with value `"m-1"`
- **THEN** the push envelope contains `"merchantId": "m-1"` in `changedRows`

#### Scenario: Local-only columns are excluded

- **WHEN** a row has `is_synced = 0` and `is_synced` is in `localOnlyColumns`
- **THEN** the `changedRows` entry does not contain an `isSynced` or `is_synced` key

### Requirement: Idempotency key from outbox IDs

The push engine SHALL generate a deterministic idempotency key by sorting all outbox IDs in the push, concatenating them with null byte separators, and computing SHA-256.

#### Scenario: Same outbox IDs produce same key regardless of order

- **WHEN** outbox IDs `["b", "a"]` and `["a", "b"]` are used
- **THEN** both produce the same idempotency key

### Requirement: Generic scope resolution via contract

The push engine SHALL use the scope column defined in the generated contract for each table to filter outbox rows. The engine's `scope_id` SHALL match against `sync_outbox.scope_id` without requiring a `scope_type` column.

#### Scenario: Outbox query uses generic scope_id

- **WHEN** the engine is configured with `scope_id: "merchant-1"`
- **THEN** outbox reads filter by `scope_id = "merchant-1"` for all tables, regardless of which column is the scope column

### Requirement: Local row upsert query

The push engine SHALL use an upsert query that inserts a new row or updates an existing row on conflict with `id`, but only when the local row is synced (`is_synced = 1`) or the incoming row is newer (`excluded.updated_at >= table.updated_at`).

#### Scenario: Synced local row is overwritten

- **WHEN** a pull response contains a row with `id = "cat-1"` and the local row has `is_synced = 1`
- **THEN** the local row is updated with the incoming values

#### Scenario: Newer server row overwrites dirty local row

- **WHEN** a pull response contains a row with a newer `updated_at` than the local row
- **THEN** the local row is updated regardless of `is_synced` state
