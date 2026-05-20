## 1. Schema Helpers (JS — `packages/baresync/src/schema/`)

- [x] 1.1 Create `row-state.ts` exporting `localSyncRowState` and `apiSyncRowState` column helper objects
- [x] 1.2 Create `synced-table.ts` exporting `defineSyncedTable` and `syncedTable` with scope metadata and column exclusion support
- [x] 1.3 Create `contract.ts` exporting `defineSyncContract` and `syncSchema` with default limits
- [x] 1.4 Add structural validation to `defineSyncContract`: primary key `id`, scope column exists, `deletedAt` present, encoding check
- [x] 1.5 Add `syncServerSchema` export with `syncBatchRequests` table definition
- [x] 1.6 Wire `schema/index.ts` to re-export all public symbols
- [x] 1.7 Add tests for synced-table validation (missing PK, missing scope, missing deletedAt)
- [x] 1.8 Add tests for contract creation with valid and invalid encoding

## 2. Rust Core Types (`crates/baresync-core/src/`)

- [x] 2.1 Create `config.rs` with `SyncEngineConfig` struct (`scope_id`, `api_url`, `client_id`, `encoding`, `target_push_bytes`, `max_push_bytes`, `max_push_rows`)
- [x] 2.2 Create `limits.rs` exporting constants matching `limits.ts` (`DEFAULT_POS_TARGET_PUSH_BYTES`, `DEFAULT_API_MAX_PUSH_BYTES`, `DEFAULT_MAX_PUSH_ROWS`, `DEFAULT_DB_BIND_PARAMETER_BUDGET`)
- [x] 2.3 Create `error.rs` with `SyncError` enum covering network, validation, database, encoding, and migration error variants
- [x] 2.4 Create `state.rs` with `LocalSyncState` struct (`local_dirty_count`, `last_server_watermark`, `needs_baseline_sync`)
- [x] 2.5 Update `lib.rs` to declare all new public modules

## 3. Local Database (`crates/baresync-core/src/` + `crates/tauri-plugin-baresync/`)

- [x] 3.1 Create `db.rs` with `LocalDatabase::connect` implementing WAL, `foreign_keys = ON`, `busy_timeout`, `max_connections = 1`, `create_if_missing`
- [x] 3.2 Create `drizzle_proxy.rs` with `SqlQuery`, `SqlRow`, `SqlStatement`, `BatchResult`, `DbInfo` types
- [x] 3.3 Implement `run_sql` function (method dispatch: `"run"` → execute+empty result, else → fetch rows with JSON value conversion)
- [x] 3.4 Implement `run_sql_batch` function (transactional: all-or-nothing statement execution)
- [x] 3.5 Implement `get_db_info` function (path, size_bytes, size_formatted)
- [x] 3.6 Create `migrations.rs` with `MigrationFile` struct, `__drizzle_migrations` table creation, and migration runner
- [x] 3.7 Implement migration SQL splitting by `--> statement-breakpoint`, per-migration transaction, and idempotent hash tracking
- [x] 3.8 Add tests: fresh DB applies all migrations, second run skips, failed migration rolls back, re-run after fix succeeds
- [x] 3.9 Add tests: `run_sql` select returns rows, `run_sql` run returns empty, `run_sql_batch` commits all, `run_sql_batch` rolls back on failure
- [x] 3.10 Create `crates/tauri-plugin-baresync/src/db.rs` and `commands.rs` with Tauri command wrappers delegating to baresync-core
- [x] 3.11 Create `packages/baresync/src/db/drizzle-proxy.ts` exporting `createTauriDrizzleDatabase`
- [x] 3.12 Create `packages/baresync/src/db/migrations.ts` with JS migration helper types
- [x] 3.13 Wire `packages/baresync/src/db/index.ts` to re-export DB module symbols

## 4. JSON Sync Generator (`packages/baresync/src/generator/`)

- [x] 4.1 Extract `fk-order.ts` from `openspec/external/sakti-pos/packages/sync-proto-generator/src/fk-order.ts` into `packages/baresync/src/generator/`
- [x] 4.2 Extract `drizzle-reflection.ts` helper from Sakti generator
- [x] 4.3 Create `outputs.ts` that writes `sync-contract.json` with version, encoding, packageName, upsertOrder, deleteOrder, tables (columns, scope, localOnlyColumns, serverOnlyColumns), and limits
- [x] 4.4 Create `outputs.ts` that writes TypeScript file exporting `SYNC_UPSERT_ORDER` and `SYNC_DELETE_ORDER` as const arrays
- [x] 4.5 Create `config.ts` with generator config types (output directory, contract input)
- [x] 4.6 Wire `generator/index.ts` to export `generateSyncArtifacts`
- [x] 4.7 Add tests: FK chain produces correct upsert/delete order, nullable external FK is ignored, required external FK fails, cycle fails
- [x] 4.8 Add tests: generated `sync-contract.json` parses and contains all required fields
- [x] 4.9 Wire `cli.ts` to support `baresync generate` command reading config and calling `generateSyncArtifacts`

## 5. Push Client (`crates/baresync-core/src/`)

- [x] 5.1 Create `outbox.rs` with `count_pending_outbox`, `mark_outbox_synced_by_outbox_ids_tx`, and `mark_outbox_synced_by_row_ids_changed_at_or_before_tx` — using generic `scope_id` (no `scope_type`)
- [x] 5.2 Create `schema.rs` with `camel_to_snake`, `snake_to_camel`, `outbox_rows_to_table_changes`, `coalesce_operation`, and `read_unsynced_table_changes_from_outbox_tx` — using contract-driven `local_only_columns` instead of hardcoded `LOCAL_ONLY_COLUMNS`
- [x] 5.3 Create `cursor.rs` with `get_last_cursor` and `set_last_cursor_tx` reading/writing `sync_cursors` keyed by `scope_id` (no `scope_type`)
- [x] 5.4 Create `http.rs` with `sync_http_error` helper and a `send_push_request` function that POSTs JSON to `{api_url}/sync/push` with `Content-Type: application/json`
- [x] 5.5 Create `push.rs` with `build_upsert_query` (generic, extracted from Sakti), `upsert_row`, `soft_delete_row`, `debug_row_summary`, `redact_debug_value`
- [x] 5.6 Implement `generate_idempotency_key_from_outbox_ids` (SHA-256 of sorted outbox IDs with null byte separators)
- [x] 5.7 Implement `build_json_push_envelope` that constructs the JSON push envelope: scopeId, clientId, idempotencyKey, tables[] with changedRows (camelCase, excluding localOnlyColumns) and deletedIds
- [x] 5.8 Implement `push` orchestration: iterate `upsert_order`, read outbox per table, coalesce, build envelope, send, parse response, mark outbox synced, mark rows synced
- [x] 5.9 Create `engine.rs` with `SyncEngine` struct holding pool, config, and contract, exposing `push()` method
- [x] 5.10 Add tests: outbox coalescing (insert+update, insert+delete, update+delete), idempotency key determinism, camelCase conversion, local-only column exclusion
- [x] 5.11 Add tests: push orchestration with temp DB and fake HTTP — outbox rows are sent, accepted rows are marked synced, accepted local rows get `is_synced = 1`

## 6. Server Push Primitives (`packages/baresync/src/server/`)

- [x] 6.1 Create `chunking.ts` extracting `SQLITE_BIND_PARAM_LIMIT`, `SAFE_SQLITE_BIND_PARAM_LIMIT`, `DEFAULT_MAX_ROWS_PER_WRITE_CHUNK`, `DEFAULT_MAX_IDS_PER_READ_CHUNK`, `getWriteChunkSize`, `chunkArray` from Sakti source
- [x] 6.2 Add tests for `getWriteChunkSize` (respects bind budget, clamps for wide tables) and `chunkArray` (splits correctly)
- [x] 6.3 Create `limits.ts` (or reuse from `src/limits.ts`) with push validation constants
- [x] 6.4 Create `service.ts` with `decodeSyncRequest` (JSON parsing + required field validation for push/pull kinds)
- [x] 6.5 Create `service.ts` with `encodeSyncResponse` (JSON serialization with correct Content-Type)
- [x] 6.6 Create `service.ts` with `validatePushEnvelope` (byte size and row count checks, `payload_too_large` error)
- [x] 6.7 Create `service.ts` with `orderPushChanges` (sort changes by contract upsertOrder, unknown tables last)
- [x] 6.8 Add tests: valid JSON push request decode, missing field errors, envelope size/row validation, table reordering
- [x] 6.9 Wire `server/index.ts` to re-export all server primitives

## 7. Pull Client (`crates/baresync-core/src/`)

- [x] 7.1 Create `pull.rs` with JSON response parsing: expect `{ cursor, hasMore, serverTime, tables[] }` shape
- [x] 7.2 Implement `apply_pull_batch_tables_tx` — iterate tables in `upsert_order`, upsert changedRows (camelCase→snake_case, set `is_synced = 1`), then iterate `delete_order` for soft deletes
- [x] 7.3 Implement `pull` orchestration: read stored cursor, send GET to `{api_url}/sync/pull` with scopeId/tables/limit/cursor params, parse response, apply rows, advance cursor
- [x] 7.4 Implement cursor advancement: write new cursor to `sync_cursors` only after all rows applied successfully
- [x] 7.5 Add `pull()` method to `SyncEngine`
- [x] 7.6 Add tests: baseline pull with empty cursor, incremental pull with stored cursor, upsert FK order, soft delete reverse FK order, cursor does not advance on failure

## 8. Shared Fixtures and Integration Tests

- [x] 8.1 Create `packages/baresync/fixtures/sync/category-product-push.json` — deterministic push envelope with categories and products FK chain, one soft delete, stable IDs/timestamps
- [x] 8.2 Create `packages/baresync/fixtures/sync/category-product-pull.json` — deterministic pull response with categories and products, one soft delete, cursor, serverTime
- [x] 8.3 Add Rust fixture loader in `crates/baresync-core/tests/fixtures.rs` reading shared JSON fixtures
- [x] 8.4 Add Rust simulation test in `crates/baresync-core/tests/simulation.rs`: temp DB + fake HTTP + fixture-driven push and pull round-trip
- [x] 8.5 Add JS encoding-fixture tests in `packages/baresync/src/server/__test__/`: decode fixture push envelope, validate, encode response, compare with expected
- [x] 8.6 Add JS push-primitives tests in `packages/baresync/src/server/__test__/`: end-to-end decode→validate→order→encode with fixture data

## 9. Package Wiring and Verification

- [x] 9.1 Update `packages/baresync/src/index.ts` to re-export from schema, generator, db, limits
- [x] 9.2 Verify `bun x ultracite check packages/baresync` passes with all new modules
- [x] 9.3 Verify `cargo test -p baresync-core` passes with all Rust tests
- [x] 9.4 Verify `cargo test -p tauri-plugin-baresync` passes with command wrapper tests
- [x] 9.5 Verify `bun test packages/baresync/src` passes with all JS tests
- [x] 9.6 Verify `cargo test --workspace` passes (both crates + existing POS app unchanged)
