## 1. Rust Engine: Client Identity & Local State

- [x] 1.1 Create `sync_client_identity` table creation in `db.rs` (executed during `LocalDatabase::connect`)
- [x] 1.2 Add `get_or_create_client_id(pool) -> Result<String>` in `db.rs` that generates UUID v4 on first access and reuses on subsequent
- [x] 1.3 Add `uuid` crate dependency to `baresync-core/Cargo.toml`
- [x] 1.4 Implement `get_sync_local_state(pool, scope_id) -> Result<LocalSyncState>` in `state.rs` using `outbox::count_pending_outbox` and `cursor::get_last_cursor`
- [x] 1.5 Add test: first call generates client ID, second call returns same ID
- [x] 1.6 Add test: `get_sync_local_state` returns correct dirty count, cursor, and baseline flag

## 2. Rust Engine: PullStartCursor

- [x] 2.1 Add `PullStartCursor` enum to `pull.rs` with variants `Baseline` and `Stored`
- [x] 2.2 Modify `pull` function signature to accept `PullStartCursor` instead of using internal cursor read
- [x] 2.3 Update `SyncEngine::pull` to pass `PullStartCursor::Stored`
- [x] 2.4 Add cursor advancement guard: only advance in `sync_cursors` when using `Stored` mode
- [x] 2.5 Add `pull_for_tables` variant that accepts a table filter list (used by reconciliation pull)
- [x] 2.6 Add test: `Baseline` pull uses empty cursor and does not advance stored cursor
- [x] 2.7 Update existing integration tests to use `PullStartCursor::Stored`

## 3. Rust Engine: Adaptive Push Chunking

- [x] 3.1 Add `PendingTablePush` struct to `push.rs` (table name, single changed row or deleted ID, outbox IDs)
- [x] 3.2 Implement `flatten_pending_tables` that decomposes `TableOutboxChanges` into per-row `PendingTablePush` units
- [x] 3.3 Implement `merge_pending_units` that re-groups per-row units back into table-grouped chunks
- [x] 3.4 Implement `encoded_push_chunk_len` that measures the serialized JSON byte length of a chunk
- [x] 3.5 Implement `chunk_pending_push_tables(tables, max_rows, max_bytes, scope_id, client_id)` with greedy bin-pack
- [x] 3.6 Implement `split_push_chunk_for_retry(chunk)` that halves a chunk at the midpoint
- [x] 3.7 Add `SyncError::SingleRowTooLarge { table, id }` variant to `error.rs`
- [x] 3.8 Refactor `push` function to use the stack-based chunk loop: pop → local hard-limit check → send → 413 split-retry → accumulate results
- [x] 3.9 Combine accepted IDs and rejected IDs across all chunks into the final `PushResult`
- [x] 3.10 Add test: `chunk_pending_push_tables` splits a 2500-row table at max_rows=2000
- [x] 3.11 Add test: `split_push_chunk_for_retry` halves rows and preserves outbox IDs
- [x] 3.12 Add test: single-row chunk returns `SingleRowTooLarge` error on 413
- [x] 3.13 Add test: local hard limit check splits before sending

## 4. Rust Engine: Garbage Collection & Outbox Purge

- [x] 4.1 Implement `run_garbage_collection(pool, tables, scope_id) -> Result<usize>` in a new `gc.rs` module — deletes rows where `deleted_at IS NOT NULL AND deleted_at != '' AND deleted_at != 'null' AND is_synced = 1`
- [x] 4.2 Implement `purge_synced_outbox(pool, older_than) -> Result<u64>` in `outbox.rs`
- [x] 4.3 Add `gc` module to `lib.rs`
- [x] 4.4 Add test: GC deletes soft-deleted synced rows
- [x] 4.5 Add test: GC preserves non-deleted rows and unsynced rows
- [x] 4.6 Add test: `purge_synced_outbox` deletes old synced entries, preserves recent ones

## 5. Rust Engine: sync_now Orchestration

- [x] 5.1 Define `SyncNowResult` struct in `engine.rs` with `pull: PullResult`, `push: PushResult`, `purged: usize`
- [x] 5.2 Implement `SyncEngine::sync_now` — pull (Stored) → push → if rejected, pull (Baseline, rejected tables only) → GC
- [x] 5.3 Implement `SyncEngine::sync_full_resync` — pull (Baseline, all tables) → push → GC
- [x] 5.4 Wire client identity: `SyncEngine::new` calls `get_or_create_client_id` and sets config.client_id
- [x] 5.5 Add integration test: sync_now with no conflicts (pull → push → GC)
- [x] 5.6 Add integration test: sync_now with server-wins reconciliation (push rejected → re-pull baseline for rejected tables → outbox cleared)
- [x] 5.7 Add integration test: sync_full_resync from scratch

## 6. Tauri Plugin: Builder & State

- [x] 6.1 Create `crates/tauri-plugin-baresync/src/builder.rs` with `Builder` struct and methods: `api_base_url`, `max_push_bytes`, `max_push_rows`, `db_path`, `contract_tables`, `build`
- [x] 6.2 Create `crates/tauri-plugin-baresync/src/config.rs` with `PluginConfig` struct
- [x] 6.3 Define `PluginState` in `commands.rs` holding `Arc<SqlitePool>`, `SyncEngineConfig`, `SyncContractTables`, `db_path: PathBuf`
- [x] 6.4 Implement `build` returning `TauriPlugin` that initializes pool in `setup`, manages state, and registers all 10 commands
- [x] 6.5 Wire `contract_tables` from Builder into plugin state so commands have access to table order
- [x] 6.6 Add `tauri` dependency to `crates/tauri-plugin-baresync/Cargo.toml`

## 7. Tauri Plugin: Sync Commands

- [x] 7.1 Add `sync_now` command to `commands.rs` — calls `SyncEngine::sync_now`
- [x] 7.2 Add `sync_push` command — calls `SyncEngine::push`
- [x] 7.3 Add `sync_pull` command — calls `SyncEngine::pull` with `PullStartCursor::Stored`
- [x] 7.4 Add `sync_full_resync` command — calls `SyncEngine::sync_full_resync`
- [x] 7.5 Add `get_sync_local_state` command — calls state query function
- [x] 7.6 Add `purge_synced_outbox` command — calls outbox purge function
- [x] 7.7 Add `run_garbage_collection` command — calls GC function
- [x] 7.8 Refactor existing `run_sql`, `run_sql_batch`, `get_db_info` commands to use plugin state pool
- [x] 7.9 Update `lib.rs` to export builder, config, state modules
- [x] 7.10 Add test: command signatures compile and accept correct parameter types

## 8. JS Server: Request Hashing

- [x] 8.1 Add `computeSyncRequestHash(body: unknown): Promise<string>` to `service.ts` using `crypto.subtle.digest("SHA-256", ...)`
- [x] 8.2 Update `decodeSyncRequest` to compute and return the actual request hash instead of empty string
- [x] 8.3 Add test: hash is deterministic for same body
- [x] 8.4 Add test: hash differs for different bodies

## 9. JS Server: Idempotency Guard

- [x] 9.1 Add `sync_batch_requests` table definition to `schema/server-schema.ts` (columns: id, client_id, idempotency_key, request_hash, status, response_body, created_at, completed_at; unique index on `(client_id, idempotency_key)`)
- [x] 9.2 Create `packages/baresync/src/server/idempotency.ts` with `createIdempotencyGuard({ db })`
- [x] 9.3 Implement `loadPushBatchResponse(tx, { clientId, idempotencyKey, requestHash })` — SELECT from `sync_batch_requests`
- [x] 9.4 Implement `reservePushBatchResponse(tx, { clientId, idempotencyKey, requestHash })` — INSERT with pending sentinel
- [x] 9.5 Implement `finalizePushBatchResponse(tx, { clientId, idempotencyKey, requestHash, response })` — UPDATE with actual response
- [x] 9.6 Implement `guard.run({ clientId, idempotencyKey, requestHash }, callback)` with the 4-step transactional flow
- [x] 9.7 Add `ConflictRequestError` class with HTTP 409 status
- [x] 9.8 Add test: first-time push processes normally
- [x] 9.9 Add test: duplicate push replays cached response
- [x] 9.10 Add test: same key different body returns 409
- [x] 9.11 Add test: concurrent push with same key returns 409

## 10. JS Server: Cleanup Primitive

- [x] 10.1 Implement `cleanupSyncBatchRequests({ db, olderThanMs, stalePendingOlderThanMs?, limit?, dryRun? })` in `idempotency.ts`
- [x] 10.2 Default: preserve pending rows, delete completed rows older than threshold
- [x] 10.3 Support `stalePendingOlderThanMs` for explicit stale pending cleanup
- [x] 10.4 Support `limit` for bounded deletes
- [x] 10.5 Support `dryRun` for count-only reporting
- [x] 10.6 Return `{ deletedCount, oldestDeleted?, newestDeleted? }`
- [x] 10.7 Add test: deletes old completed rows
- [x] 10.8 Add test: preserves recent rows
- [x] 10.9 Add test: preserves pending rows by default
- [x] 10.10 Add test: deletes stale pending rows with explicit threshold
- [x] 10.11 Add test: bounded limit
- [x] 10.12 Add test: dry-run returns counts without deleting

## 11. JS Client: Tauri Sync Client

- [x] 11.1 Create `packages/baresync/src/tauri/client.ts` with `createSyncClient({ apiUrl, encoding, scopeId, invoke? })`
- [x] 11.2 Implement `syncNow()` → `invoke("sync_now", { scopeId })`
- [x] 11.3 Implement `push()` → `invoke("sync_push", { scopeId })`
- [x] 11.4 Implement `pull()` → `invoke("sync_pull", { scopeId })`
- [x] 11.5 Implement `fullResync()` → `invoke("sync_full_resync", { scopeId })`
- [x] 11.6 Implement `getState()` → `invoke("get_sync_local_state", { scopeId })`
- [x] 11.7 Add browser-test-safe default invoke: throw descriptive error at call time when Tauri IPC unavailable
- [x] 11.8 Update `packages/baresync/src/tauri/index.ts` to re-export `createSyncClient`
- [x] 11.9 Update `packages/baresync/src/index.ts` to re-export from tauri module
- [x] 11.10 Add test: `createSyncClient` returns object with all methods
- [x] 11.11 Add test: methods call invoke with correct command names and parameters
- [x] 11.12 Add test: custom invoke function is used for calls (testability)

## 12. Package Wiring & Verification

- [x] 12.1 Update `packages/baresync/src/server/index.ts` to re-export idempotency primitives
- [x] 12.2 Update `packages/baresync/src/schema/index.ts` to export updated `syncServerSchema` with `syncBatchRequests`
- [x] 12.3 Verify `bun test packages/baresync/src` passes
- [x] 12.4 Verify `cargo test -p baresync-core` passes
- [x] 12.5 Verify `cargo test -p tauri-plugin-baresync` passes
- [x] 12.6 Verify `bun x ultracite check packages/baresync` passes
- [x] 12.7 Verify `cargo test --workspace` passes
