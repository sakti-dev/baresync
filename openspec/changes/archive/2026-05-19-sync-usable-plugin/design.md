## Context

The `baresync-thin-vertical` change built a working sync engine with push, pull, outbox coalescing, cursor management, schema helpers, a CLI generator, server primitives, and integration tests (31 JS + 26 Rust). However, no consumer can use it yet because:

- No Tauri plugin registration surface exists — the plugin crate has 3 DB commands but no sync commands, no Builder, and no plugin state.
- No JS client wrapper — `packages/baresync/src/tauri/` is an empty re-export.
- No adaptive 413 chunking — push sends one monolithic request; if it's too large, it fails.
- No reconciliation — rejected (server-wins) push rows remain in outbox forever and are never reconciled by a follow-up pull.
- No server-side idempotency — `decodeSyncRequest` returns an empty hash; no guard against duplicate pushes.
- No garbage collection — soft-deleted synced rows accumulate.
- No client identity — `client_id` in config is a placeholder; no device-level persistence.
- No `sync_now` orchestration — the engine exposes `push()` and `pull()` separately but not the standard pull→push→reconcile→GC cycle.

The Sakti POS source at `openspec/external/sakti-pos/` contains production-proven implementations of all these patterns. This change adapts them for the public baresync API.

## Goals / Non-Goals

**Goals:**

- A consumer can register baresync as a Tauri plugin with `Builder::new().api_base_url(...).build()` and call sync commands.
- A JS consumer can call `createSyncClient({ apiUrl, encoding, scopeId }).syncNow()`.
- Push uses adaptive chunking with 413 split-retry (within-table splitting, not just between tables).
- Rejected push rows are reconciled by a follow-up pull from baseline for the rejected tables.
- Server-side idempotency prevents duplicate push processing and enables safe retries.
- `cleanupSyncBatchRequests` enables cron-safe idempotency record cleanup.
- Garbage collection purges soft-deleted synced rows; `purge_synced_outbox` cleans old synced entries.
- `get_sync_local_state` exposes dirty count, cursor, and baseline-needed flag.
- Client identity is persisted per device in a local SQLite table.

**Non-Goals:**

- Protobuf encoding support (JSON only for this change; protobuf is a future vertical).
- Batteries-included server (`createSyncServer`) — low-level primitives only.
- Generator diagnostics system (`baresync doctor`, `--check`, `--warnings-as-errors`).
- Framework adapters (Elysia, Hono, etc.) — raw primitives only.
- Migration from Sakti POS app to use this plugin (Phase 15 in PRD).
- Generated Rust mappers (Phase 11 in PRD).
- Desktop or Android smoke tests (Phase 14 in PRD).

## Decisions

### D1: Reconciliation is orchestration, not a separate module

No standalone `reconcile.rs`. The `sync_now` method in `SyncEngine` orchestrates: pull (stored cursor) → push → if rejected rows exist, pull (baseline, rejected tables only) → GC. The existing `upsert_row` SQL guard (`WHERE is_synced = 1 OR excluded.updated_at >= updated_at`) handles server-wins during pull. The reconciliation pull does NOT advance the main cursor — it pulls from baseline for the rejected tables and discards the cursor.

**Alternative considered:** A `reconcile.rs` module that tracks rejected rows and clears outbox entries. Rejected because the Sakti production code handles this as orchestration in `sync_now`, and the pull-based upsert guard is sufficient.

### D2: Chunking lives in `push.rs` as in Sakti

The `PendingTablePush` struct, `chunk_pending_push_tables`, `split_push_chunk_for_retry`, and the stack-based retry loop go in `push.rs`. This matches the Sakti architecture and keeps the push pipeline self-contained.

Flattening to per-row units enables within-table splitting — a table with 2500 rows at `max_rows=2000` becomes two chunks (2000 + 500), not a single oversized chunk.

**Alternative considered:** A separate `chunking.rs` module. Rejected because the chunking logic is tightly coupled to the push data structures and the Sakti code already keeps them together.

### D3: PullStartCursor enum in pull module

```rust
pub enum PullStartCursor {
    Baseline,  // empty cursor — pulls everything
    Stored,    // uses stored cursor from sync_cursors
}
```

`sync_now` uses `Stored` for the main pull and `Baseline` for reconciliation pulls. `sync_full_resync` uses `Baseline`.

### D4: Builder pattern for Tauri plugin

```rust
tauri::Builder::default()
    .plugin(
        tauri_plugin_baresync::Builder::new()
            .api_base_url("https://api.example.com")
            .max_push_bytes(256 * 1024)
            .max_push_rows(2000)
            .db_path("data/baresync.db")
            .build(),
    )
```

The Builder creates a `TauriPlugin` that manages its own `SqlitePool`, `SyncEngineConfig`, and `SyncContractTables`. This differs from the Sakti approach (direct `invoke_handler` registration) because baresync is a reusable plugin, not app-internal code.

### D5: Plugin commands match Sakti surface but use generic scope

10 commands total. Sync commands use `scope_id` instead of `outlet_id`:

| Command | Purpose |
|---------|---------|
| `run_sql` | Drizzle proxy single query |
| `run_sql_batch` | Drizzle proxy batch transactional |
| `get_db_info` | DB path and file size |
| `sync_now` | Full cycle: pull → push → reconcile → GC |
| `sync_push` | Push-only |
| `sync_pull` | Pull-only |
| `sync_full_resync` | Baseline pull + push + GC |
| `get_sync_local_state` | Dirty count, cursor, baseline flag |
| `purge_synced_outbox` | Clean old synced outbox entries |
| `run_garbage_collection` | Purge soft-deleted synced rows |

### D6: Idempotency guard follows Sakti's 4-step transactional pattern

1. **Load** — check `sync_batch_requests` for existing `(clientId, idempotencyKey)`. If found with matching hash → replay. If pending → 409 conflict. If different hash → 409 conflict.
2. **Reserve** — INSERT with `response_json = '{"pending":true}'` sentinel.
3. **Execute** — caller runs business writes.
4. **Finalize** — UPDATE with actual response.

The guard uses Drizzle for DB access and Web Crypto `crypto.subtle.digest("SHA-256", ...)` for request hashing. The hash covers the serialized JSON body (not protobuf binary, since we're JSON-only for now).

### D7: Client identity stored in local SQLite

A `sync_client_identity` table persists a stable `clientId` per device:

```sql
CREATE TABLE IF NOT EXISTS sync_client_identity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
);
```

On first sync, a random UUID is generated and stored. Subsequent syncs reuse it. This replaces the placeholder `client_id` in `SyncEngineConfig`.

### D8: JS client uses Tauri `invoke` under the hood

```ts
const client = createSyncClient({
    apiUrl: "https://api.example.com",
    encoding: "json",
    scopeId: "outlet-1",
});
await client.syncNow();    // → invoke("sync_now", { ... })
await client.push();       // → invoke("sync_push", { ... })
await client.getState();   // → invoke("get_sync_local_state", { ... })
```

The client wrapper is testable with mocked `invoke` for unit tests. It does not import `@tauri-apps/api` directly — it accepts an `invoke` function in its config for testability.

### D9: Error types gain `SingleRowTooLarge` variant; `PayloadTooLarge` uses generic HTTP error

`SyncError` gets one new variant for the chunking system:
- `SingleRowTooLarge { table: String, id: String }` — a single row exceeds the hard byte limit

`PayloadTooLarge` is not a dedicated variant. Instead, HTTP 413 errors are represented as `SyncError::Http { status: 413, body, kind: "payload_too_large" }` via the existing `classify_http_error` function. The push loop catches `SyncError::Http { status: 413, .. }` and splits. This avoids duplicating a variant that the generic `Http` error already covers.

**Alternative considered:** A dedicated `PayloadTooLarge` enum variant. Rejected because the generic `Http` variant with `classify_http_error` already provides structured error classification, and adding a parallel variant would require keeping both in sync.

## Risks / Trade-offs

**[Push chunking adds complexity to push.rs]** → The Sakti code has ~825 lines of push logic including chunking. This is unavoidable for production correctness — without adaptive chunking, any sync with enough data will fail. Mitigated by porting proven Sakti logic with tests.

**[Reconciliation pull from baseline could be expensive for large tables]** → Only the rejected tables are re-pulled, not all tables. The cursor is not advanced, so the next normal pull skips already-applied rows. Mitigated by scoping the baseline pull to rejected table names only.

**[Builder pattern means plugin owns the SqlitePool]** → The Sakti app currently shares a pool between the data layer and sync engine. The plugin model creates a separate pool. This is acceptable because the PRD specifies `max_connections = 1` and the pool is used for sync operations only; the Drizzle proxy commands share the same pool. If a consumer needs to share with their own data layer, they can use the same DB path.

**[Idempotency table grows without cleanup]** → The `cleanupSyncBatchRequests` primitive is included in this change. Conservative defaults (7-day retention, bounded deletes, pending-safe) prevent accidental data loss. No automatic cleanup — consumers run it via cron.

**[JS client is thin — most logic is in Rust]** → The JS client is intentionally a Tauri `invoke` wrapper. This keeps the sync logic in Rust where it has direct SQLite access and avoids duplicating push/pull logic in JS. The trade-off is that the JS client is not usable outside Tauri (which matches the PRD: Tauri-only for v1).

**[Plugin registration depends on generated contract tables]** → The Builder needs `SyncContractTables` (upsert_order, delete_order, local_only_columns). Currently these come from the generated `sync-contract.json`. The plugin must either embed the contract at build time or load it at runtime. For this change, the Builder accepts contract tables as a parameter, and the consumer passes them from the generated output.
