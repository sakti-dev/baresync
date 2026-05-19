## MODIFIED Requirements

### Requirement: Generic push engine with JSON encoding

The `crates/baresync-core/src/push.rs` module SHALL export a `push` function that accepts a `SqlitePool`, a `SyncEngineConfig` (containing `scope_id`, `api_url`, `client_id`, `encoding: "json"`), and a `SyncContract` (with `upsert_order`, `delete_order`, `tables`, and `local_only_columns`).

The push engine SHALL:
1. Iterate tables in `upsert_order`
2. For each table, read unsynced outbox rows from `sync_outbox` where `scope_id` matches the engine's `scope_id`
3. Coalesce outbox operations per row (insert→update→delete collapsing)
4. Flatten all table changes into per-row `PendingTablePush` units
5. Greedy bin-pack units into chunks respecting `max_rows` and `target_push_bytes`
6. Push chunks using a stack-based retry loop:
   a. Check local hard limit (`max_push_bytes`) — split in half if exceeded
   b. Send chunk to `{api_url}/sync/push` with `Content-Type: application/json`
   c. On HTTP 413, split chunk in half and push both halves back onto stack
   d. On single-row chunk that is too large, return `SingleRowTooLarge` error
7. Parse the JSON response for each successful chunk
8. Mark accepted rows' outbox entries as synced
9. Mark accepted local rows as `is_synced = 1`
10. Track rejected rows (server-wins) in the combined `PushResult`
11. Return a combined `PushResult` from all chunks

#### Scenario: Push sends outbox changes in FK order

- **WHEN** the outbox has pending changes for products and categories (in any order)
- **THEN** the push envelope's `tables` array lists categories before products (matching `upsert_order`)

#### Scenario: Push marks accepted outbox rows as synced

- **WHEN** the server accepts all pushed rows
- **THEN** the corresponding `sync_outbox` rows have `synced_at` set to the server time

#### Scenario: Push marks accepted local rows as synced

- **WHEN** the server accepts a row and the local row has no remaining unsynced outbox entries
- **THEN** the local row's `is_synced` is set to `1`

#### Scenario: Push with 413 split-retry

- **WHEN** a chunk receives HTTP 413 and contains multiple rows
- **THEN** the chunk SHALL be split in half and both halves retried

#### Scenario: Push tracks rejected rows

- **WHEN** the server rejects some rows with reason "server_newer"
- **THEN** the `PushResult` SHALL contain `rejected_tables` and `server_wins_count`
