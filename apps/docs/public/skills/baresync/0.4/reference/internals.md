# Internals

Deep engine details that rarely come up in daily work but useful for understanding how baresync works under the hood.

For exact Rust type signatures (`SyncEngine`, `SyncNowResult`, `PushResult`, `PullResult`, `LocalSyncState`), see the [Rust API reference](https://baresync.hieka.id/docs/reference/rust-api). For Tauri IPC command signatures, see [reference/tauri-plugin.md](tauri-plugin.md).

## Status flow

Before choosing a sync mode, the engine calls the server's status endpoint:

1. Reads stored cursor from `sync_cursors` for the scope
2. Sends POST to `/status` with `{ scopeId, cursor }`
3. Server returns `hasChanges`, `changedTables`, `cursor`, `serverTime`

If no cursor exists (first sync), the engine sends an empty string. The `changedTables` list is used as a filter for the pull request — avoids pulling from tables that haven't changed.

## Push envelope

Each push chunk is sent as:

```json
{
  "scopeId": "merchant-1",
  "clientId": "uuid-of-device",
  "idempotencyKey": "sha256-of-sorted-outbox-ids",
  "tables": [
    {
      "table": "items",
      "changedRows": [{ "id": "item-10", "name": "New item" }],
      "deletedIds": ["item-3"]
    }
  ]
}
```

### Idempotency key

The `idempotencyKey` is a SHA-256 hash of the sorted outbox IDs in the chunk. If a push fails and is retried with the same outbox entries, the server detects the duplicate using this key.

## Chunking

The engine splits oversized pushes into chunks that fit within configured limits:

| Limit | Default | Config field |
|---|---|---|
| Max rows per chunk | 2000 | `max_push_rows` |
| Target bytes per chunk | 256 KB | `target_push_bytes` |
| Hard byte ceiling | 2 MB | `max_push_bytes` |

Set on the Tauri plugin builder:

```rust
builder
    .max_push_rows(1000)
    .target_push_bytes(128 * 1024)
    .max_push_bytes(1024 * 1024)
```

### 413 retry

If the server rejects a chunk with HTTP 413 (Payload Too Large), the engine splits that chunk in half and retries both halves recursively until it succeeds or a single row exceeds `max_push_bytes`.

## Pull upsert SQL

The engine uses this upsert for each pulled row:

```sql
INSERT INTO {table} ({columns}) VALUES ({placeholders})
ON CONFLICT(id) DO UPDATE SET {set_clause}
WHERE {table}.is_synced = 1 OR excluded.updated_at >= {table}.updated_at
```

- Server rows always overwrite synced local rows (`is_synced = 1`)
- Server rows overwrite unsynced local rows only if the server row is newer
- Local unsynced edits that are newer are preserved

## Pull soft-delete SQL

```sql
UPDATE {table}
SET deleted_at = {serverTime}, updated_at = {serverTime}, is_synced = 1
WHERE id = {id}
```

The row is marked deleted but not removed. GC later hard-deletes it after it's synced.

## Column name conversion

The engine converts between `camelCase` (API) and `snake_case` (SQLite) automatically:

- API sends `{ "merchantId": "..." }` → stored as `merchant_id`
- Server receives `snake_case` from your repository, sends `camelCase` in the response

## Table ordering

- Upserts applied in `upsert_order` (from the contract's table order)
- Deletes applied in `delete_order` (reverse of upsert order)
- This respects foreign key dependencies

## Runtime tables

Created automatically by the migration system at startup. These are not part of your schema — the plugin manages them.

### sync_outbox (local)

Tracks pending local changes that need pushing.

| Column | Type | Purpose |
|---|---|---|
| `id` | `text` PK | UUID |
| `table_name` | `text` | Which table the change belongs to |
| `row_id` | `text` | Which row changed |
| `operation` | `text` | `"insert"`, `"update"`, or `"delete"` |
| `payload` | `text` nullable | Optional JSON payload |
| `scope_id` | `text` | Scope the change belongs to |
| `changed_at` | `text` | ISO timestamp of the change |
| `synced_at` | `text` nullable | When the change was synced (null = pending) |

Unique index on `(table_name, row_id) WHERE synced_at IS NULL` — only one pending entry per row.

### sync_cursors (local)

Stores the last cursor timestamp per scope for incremental pulls.

| Column | Type | Purpose |
|---|---|---|
| `id` | `integer` PK (auto) | Row ID |
| `scope_id` | `text` | Scope identifier |
| `last_cursor` | `text` | Last server watermark |
| `updated_at` | `text` | When the cursor was last updated |

### sync_batch_requests (server)

Stores idempotency records for push requests.

| Column | Type | Purpose |
|---|---|---|
| `id` | `integer` PK (auto) | Row ID |
| `client_id` | `text` | Client identifier |
| `idempotency_key` | `text` | Unique key per push batch |
| `request_hash` | `text` | Hash of the request body |
| `status` | `text` | `"pending"`, `"completed"`, or `"failed"` |
| `response_body` | `text` nullable | Cached response for replay |
| `created_at` | `integer` | Unix timestamp |
| `completed_at` | `integer` nullable | When processing finished |

Unique index on `(client_id, idempotency_key)` — retries with the same key return cached response.

## Server-side chunking helpers

For large writes on the server side, use chunking helpers from `baresync/server`:

```ts
import { chunkArray, getWriteChunkSize, SAFE_SQLITE_BIND_PARAM_LIMIT } from "baresync/server";

const chunkSize = getWriteChunkSize({ columnCount: 8 });
const chunks = chunkArray(rows, chunkSize);
```

| Constant | Value | Description |
|---|---|---|
| `SQLITE_BIND_PARAM_LIMIT` | 32,766 | Hard SQLite limit |
| `SAFE_SQLITE_BIND_PARAM_LIMIT` | 30,000 | Safe default |
| `DEFAULT_MAX_ROWS_PER_WRITE_CHUNK` | 500 | Max rows per write chunk |
| `DEFAULT_MAX_IDS_PER_READ_CHUNK` | 1,000 | Max IDs per read query |

`getWriteChunkSize` divides `SAFE_SQLITE_BIND_PARAM_LIMIT` by the number of columns, then caps the result at `maxRowsPerChunk` (default 500). Returns at least 1.

## Cursor storage

- Stored cursors advance after incremental pulls
- Baseline pulls (empty request cursor) only write the response cursor when no cursor is already stored
- This prevents a baseline pull from clobbering a cursor from a previous partial sync while still allowing a fresh device to initialize from the response
