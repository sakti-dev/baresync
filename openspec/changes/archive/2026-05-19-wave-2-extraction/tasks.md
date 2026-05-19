## 1. Stream B — Rust DB Pool and Value Conversion (baresync-core/db.rs)

- [x] 1.1 Extract `sqlx_value_to_json` from Sakti `db/sqlite.rs` into `crates/baresync-core/src/db.rs`, removing Sakti-specific imports (use `sqlx::Row`, `sqlx::Column`, `serde_json::Value`, base64)
- [x] 1.2 Extract `connect_db(path)` from Sakti `drizzle_proxy.rs::init_db` into `crates/baresync-core/src/db.rs`, removing Tauri `AppHandle` dependency — accept path string directly
- [x] 1.3 Extract `DbInfo` struct and `get_db_info(path)` from Sakti `drizzle_proxy.rs` into `crates/baresync-core/src/db.rs`
- [x] 1.4 Extract `format_file_size` helper into `crates/baresync-core/src/db.rs`
- [x] 1.5 Add pool settings tests: WAL mode verified, max_connections = 1 verified, foreign_keys ON verified
- [x] 1.6 Add `get_db_info` test with temp SQLite file

## 2. Stream B — Rust Drizzle Proxy (baresync-core/drizzle_proxy.rs)

- [x] 2.1 Define `SqlQuery`, `SqlRow`, `SqlStatement`, `BatchResult` types in `crates/baresync-core/src/drizzle_proxy.rs` (copy from Sakti `drizzle_proxy.rs`)
- [x] 2.2 Extract `bind_value` function from Sakti `drizzle_proxy.rs` into `crates/baresync-core/src/drizzle_proxy.rs`
- [x] 2.3 Extract `run_sql(pool, query)` from Sakti (without `#[command]` and `State` wrapper) into `crates/baresync-core/src/drizzle_proxy.rs`
- [x] 2.4 Extract `run_sql_batch(pool, statements)` from Sakti into `crates/baresync-core/src/drizzle_proxy.rs`
- [x] 2.5 Add test: `run_sql` with SELECT returns rows
- [x] 2.6 Add test: `run_sql` with method "run" returns empty
- [x] 2.7 Add test: `run_sql_batch` commits all statements
- [x] 2.8 Add test: `run_sql_batch` rolls back on failure
- [x] 2.9 Add test: parameterized query binds values correctly

## 3. Stream B — Rust Migration Runner (baresync-core/migrations.rs)

- [x] 3.1 Extract `MigrationFile` struct and `collect_migration_files` from Sakti `db/migrations.rs` into `crates/baresync-core/src/migrations.rs`
- [x] 3.2 Define `EmbeddedMigration { name: &'static str, sql: &'static str }` and `MigrationConfig { strict: bool }` in `crates/baresync-core/src/migrations.rs`
- [x] 3.3 Extract `run_migrations(pool, config, migrations)` from Sakti `drizzle_proxy.rs::run_migrations` — add strict/tolerant mode branching
- [x] 3.4 Add `get_migration_status(pool)` function that queries `__drizzle_migrations`
- [x] 3.5 Add test: `collect_migration_files` sorts and filters correctly
- [x] 3.6 Add test: successful CREATE TABLE migration commits and records
- [x] 3.7 Add test: failing second statement rolls back first in strict mode
- [x] 3.8 Add test: already-applied migration is skipped
- [x] 3.9 Add test: tolerant mode skips "already exists" errors
- [x] 3.10 Add test: tolerant mode skips "duplicate column" errors
- [x] 3.11 Add test: `get_migration_status` returns applied migrations

## 4. Stream B — Tauri Plugin DB Commands

- [x] 4.1 Add `run_sql` Tauri command in `crates/tauri-plugin-baresync/src/commands.rs` delegating to `baresync_core::drizzle_proxy::run_sql`
- [x] 4.2 Add `run_sql_batch` Tauri command delegating to `baresync_core::drizzle_proxy::run_sql_batch`
- [x] 4.3 Add `get_db_info` Tauri command delegating to `baresync_core::db::get_db_info`
- [x] 4.4 Add `run_migrations` Tauri command delegating to `baresync_core::migrations::run_migrations`
- [x] 4.5 Add `get_migration_status` Tauri command delegating to `baresync_core::migrations::get_migration_status`
- [x] 4.6 Register all 5 new commands in `Builder::build()` alongside existing 10 sync commands
- [x] 4.7 Add `migrations` method to `Builder` that stores embedded migration config
- [x] 4.8 Wire pool initialization in plugin setup using `connect_db` from core

## 5. Stream B — JS Drizzle Proxy Helper

- [x] 5.1 Create `createTauriDrizzleDatabase` in `packages/baresync/src/db/drizzle-proxy.ts` — wraps `drizzle-orm/sqlite-proxy` with Tauri invoke adapter
- [x] 5.2 Support custom `invoke` function for testability (fallback to `@tauri-apps/api/core` invoke)
- [x] 5.3 Export `createTauriDrizzleDatabase` from `packages/baresync/src/db/index.ts`
- [x] 5.4 Add test: `createTauriDrizzleDatabase` with mock invoke routes queries correctly

## 6. Stream A — Generator Diagnostics Model

- [x] 6.1 Create `SyncDiagnostic` type and `runDiagnostics(contract)` in `packages/baresync/src/generator/diagnostics.ts`
- [x] 6.2 Implement error code `SYNC_SCHEMA_MISSING_PRIMARY_KEY` — table lacks `id` primary key
- [x] 6.3 Implement error code `SYNC_SCHEMA_MISSING_SCOPE_COLUMN` — scope field not found in table columns
- [x] 6.4 Implement error code `SYNC_SCHEMA_MISSING_DELETED_AT` — table lacks `deletedAt` column
- [x] 6.5 Implement error code `SYNC_SCHEMA_FK_CYCLE` — FK graph has a cycle
- [x] 6.6 Implement error code `SYNC_SCHEMA_REQUIRED_EXTERNAL_FK` — required FK to non-synced table
- [x] 6.7 Implement error code `SYNC_SCHEMA_DUPLICATE_TABLE_NAME` — same table name used twice
- [x] 6.8 Implement error code `SYNC_SCHEMA_UNSUPPORTED_COLUMN_TYPE` — Drizzle column type not supported by sync
- [x] 6.9 Implement error code `SYNC_SCHEMA_MISSING_ROW_STATE_COLUMN` — missing required row-state column
- [x] 6.10 Implement error code `SYNC_SCHEMA_MISSING_SYNC_UPDATED_AT` — table lacks `syncUpdatedAt`
- [x] 6.11 Implement error code `SYNC_SCHEMA_MISSING_LOCAL_IS_SYNCED` — table lacks `isSynced`
- [x] 6.12 Implement error code `SYNC_SCHEMA_UNSUPPORTED_PRIMARY_KEY` — PK is not single text column
- [x] 6.13 Implement error code `SYNC_SCHEMA_DUPLICATE_FIELD_NAME` — duplicate field within a table
- [x] 6.14 Implement error code `SYNC_SCHEMA_RESERVED_FIELD_REUSED` — reserved field name conflict
- [x] 6.15 Implement error code `SYNC_SCHEMA_ENCODING_UNSUPPORTED` — encoding not `"json"` or `"protobuf"`
- [x] 6.16 Implement error code `SYNC_SCHEMA_PROTOBUF_FIELD_NUMBER_REUSED` — protobuf field number collision

## 7. Stream A — Generator Warning Codes

- [x] 7.1 Implement warning `SYNC_INDEX_MISSING_SCOPE_WATERMARK` — no index on (scope, syncUpdatedAt, id)
- [x] 7.2 Implement warning `SYNC_INDEX_MISSING_LOCAL_DIRTY` — no index on (isSynced, updatedAt, id)
- [x] 7.3 Implement warning `SYNC_SCHEMA_NULLABLE_SCOPE_COLUMN` — scope column is nullable
- [x] 7.4 Implement warning `SYNC_SCHEMA_NO_CONFLICT_STRATEGY` — no conflict metadata defined
- [x] 7.5 Implement warning `SYNC_SCHEMA_NO_DELETE_STRATEGY` — no delete metadata defined
- [x] 7.6 Implement warning `SYNC_SCHEMA_LARGE_TEXT_FIELD` — text field exceeds recommended size
- [x] 7.7 Implement warning `SYNC_SCHEMA_JSON_ONLY_FIELD` — field type has no protobuf equivalent
- [x] 7.8 Implement warning `SYNC_SCHEMA_BATTERIES_INCLUDED_COMPLEX_MAPPING` — complex mapping detected
- [x] 7.9 Implement warning `SYNC_COMPAT_ADDITIVE_CHANGE` — additive change detected vs previous manifest

## 8. Stream A — Generator Diagnostics Integration

- [x] 8.1 Integrate `runDiagnostics` into `generateSyncArtifacts` — block on errors, print warnings
- [x] 8.2 Add test: generation blocked when errors present, no files written
- [x] 8.3 Add test: generation proceeds when only warnings present
- [x] 8.4 Create `sync-contract.manifest.json` writer in `packages/baresync/src/generator/manifest.ts`
- [x] 8.5 Write manifest on successful generation with contract version, generator version, encoding, tables, scope mappings, table order, output paths
- [x] 8.6 Add `baresync doctor <config-path>` CLI command — run diagnostics only, no file writes
- [x] 8.7 Add `--check` flag to `baresync generate` — dry-run comparison without writing
- [x] 8.8 Add `--warnings-as-errors` flag to `baresync generate`
- [x] 8.9 Add test: doctor exits 1 on errors, 0 on warnings only
- [x] 8.10 Add test: manifest includes correct table order from FK analysis

## 9. Stream C — Server Cursor Primitives

- [x] 9.1 Add `parseSyncCursor(cursor: string)` to `packages/baresync/src/server/service.ts` — parse `"sync:timestamp:tableName:rowId"` format
- [x] 9.2 Add `formatSyncCursor(input)` to `packages/baresync/src/server/service.ts` — format cursor string
- [x] 9.3 Add test: valid cursor parsed correctly
- [x] 9.4 Add test: empty cursor returns null
- [x] 9.5 Add test: invalid cursor throws
- [x] 9.6 Add test: cursor roundtrip (format → parse) recovers original values
- [x] 9.7 Export `parseSyncCursor` and `formatSyncCursor` from `packages/baresync/src/server/index.ts`

## 10. Stream C — Server Delete Ordering and Error Mapping

- [x] 10.1 Add `orderDeleteChanges(input)` to `packages/baresync/src/server/service.ts` — reverse upsert order
- [x] 10.2 Add test: delete changes reversed from upsert order
- [x] 10.3 Add test: unknown delete tables placed last
- [x] 10.4 Add `mapSyncError(error: unknown)` to `packages/baresync/src/server/service.ts` — map to stable error codes
- [x] 10.5 Add test: HTTP 413 mapped to `sync_payload_too_large`
- [x] 10.6 Add test: ConflictRequestError mapped to `sync_idempotency_conflict`
- [x] 10.7 Add test: network TypeError mapped to `sync_network_error`
- [x] 10.8 Add test: unknown error mapped to `sync_unknown`
- [x] 10.9 Add `countPushRows(body)` to `packages/baresync/src/server/service.ts`
- [x] 10.10 Add test: rows counted across multiple tables
- [x] 10.11 Add test: empty body returns 0
- [x] 10.12 Export `orderDeleteChanges`, `mapSyncError`, `countPushRows` from `packages/baresync/src/server/index.ts`

## 11. Verification

- [x] 11.1 Run `cargo test -p baresync-core` — all DB, proxy, and migration tests pass
- [x] 11.2 Run `cargo test -p tauri-plugin-baresync` — plugin command tests pass
- [x] 11.3 Run `bun test packages/baresync/src` — all JS tests pass (server + generator + tauri client)
- [x] 11.4 Run `bun x ultracite check packages/baresync` — linting passes
- [x] 11.5 Run `bun packages/baresync/src/cli.ts doctor` with test contract — doctor command works
- [x] 11.6 Run `bun packages/baresync/src/cli.ts generate --check` — check command works

## 12. Verification Fixes

- [x] 12.1 Add test for SYNC_SCHEMA_MISSING_SCOPE_COLUMN
- [x] 12.2 Add test for SYNC_SCHEMA_UNSUPPORTED_COLUMN_TYPE (using numeric column)
- [x] 12.3 Add test for SYNC_SCHEMA_DUPLICATE_FIELD_NAME
- [x] 12.4 Add test for SYNC_SCHEMA_RESERVED_FIELD_REUSED
- [x] 12.5 Add test for SYNC_SCHEMA_JSON_ONLY_FIELD
- [x] 12.6 Add test for SYNC_SCHEMA_BATTERIES_INCLUDED_COMPLEX_MAPPING
- [x] 12.7 Implement SYNC_COMPAT_ADDITIVE_CHANGE with DiagnosticOptions.previousTables
- [x] 12.8 Implement SYNC_SCHEMA_PROTOBUF_FIELD_NUMBER_REUSED with DiagnosticOptions.previousFieldNumbers
- [x] 12.9 Add SYNC_SCHEMA_BATTERIES_INCLUDED_NOT_1_TO_1 error code with test
- [x] 12.10 Add test: error blocks generation, zero files written
- [x] 12.11 Add doctor output format test
- [x] 12.12 Run `bun test packages/baresync/src` — 107 tests pass
- [x] 12.13 Run `bun x ultracite check packages/baresync` — only 3 pre-existing useAwait warnings
- [x] 12.14 Run `cargo test --workspace` — 53 Rust tests pass
