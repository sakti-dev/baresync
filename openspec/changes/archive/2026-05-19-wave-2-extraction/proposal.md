## Why

Wave 1 (shells) and the thin-vertical spike delivered a working sync engine with JSON push/pull, adaptive chunking, a Tauri plugin builder, a JS sync client, and server idempotency. But the plugin lacks the local database runtime (SQLite setup, Drizzle proxy, migration runner), the server package is missing most low-level primitives a consumer needs to build a server, and the generator has no diagnostics system. Without these three extraction streams, no consumer can use baresync in a real app — they can't initialize a database, can't run migrations, can't implement a sync server, and can't validate their schema before generating.

## What Changes

**Stream A — Generator Diagnostics (P5)**
- Add structured `SyncDiagnostic` model with error/warning/info severity, actionable `why`/`fix`, and docs links
- Add `baresync doctor` CLI command for preflight validation
- Add `--check` and `--warnings-as-errors` flags to `baresync generate`
- Add `sync-contract.manifest.json` output for drift/evolution detection
- Stop generation on error diagnostics; print warnings but continue unless `--warnings-as-errors`
- Implement all 15 required error codes and 9 required warning codes from PRD

**Stream B — Local DB Runtime Extraction (P4)**
- Extract SQLite pool setup (path resolution, WAL mode, foreign_keys, busy_timeout, max_connections=1) from Sakti POS into `crates/baresync-core/src/db.rs`
- Extract migration runner (deterministic discovery, `__drizzle_migrations`, statement-breakpoint splitting, transactional DDL, strict/tolerant modes) from Sakti POS into `crates/baresync-core/src/migrations.rs`
- Extract Drizzle proxy command surface (`run_sql`, `run_sql_batch`) from Sakti POS into `crates/baresync-core/src/drizzle_proxy.rs`
- Extract `get_db_info` into `crates/baresync-core/src/db.rs`
- Add Tauri plugin commands: `run_sql`, `run_sql_batch`, `get_db_info`, `run_migrations`, `get_migration_status`
- Add JS `createTauriDrizzleDatabase({ schema, commands })` in `packages/baresync/src/db/drizzle-proxy.ts`
- Add migration runner transactional DDL hardening tests

**Stream C — Server Primitives Completion (P6)**
- Add `decodeSyncRequest` — JSON/protobuf decode with content-type handling
- Add `encodeSyncResponse` — JSON/protobuf encode with content-type handling
- Add `validatePushEnvelope` — byte and row limit validation
- Add `orderPushChanges` / `orderDeleteChanges` — FK-order-aware table ordering
- Add `parseSyncCursor` / `formatSyncCursor` — cursor parsing and formatting
- Add `mapSyncError` — known sync error mapping to stable error codes
- Add `countPushRows` — row counting helper
- Extract chunking constants and DB bind-parameter chunking from Sakti API

## Capabilities

### New Capabilities
- `local-db-runtime`: SQLite pool setup, Drizzle proxy commands, migration runner, DB info — the full local database runtime a Tauri app needs
- `generator-diagnostics`: Structured diagnostics system, doctor command, manifest output, --check/--warnings-as-errors flags
- `server-low-level-primitives`: Low-level server primitives — decodeSyncRequest, encodeSyncResponse, validatePushEnvelope, orderPushChanges, parseSyncCursor, formatSyncCursor, mapSyncError, countPushRows
- `migration-runner`: Deterministic SQL migration discovery, transactional DDL execution, strict/tolerant modes, __drizzle_migrations tracking

### Modified Capabilities
- `server-push-primitives`: add chunking constants, DB bind-parameter chunking, and request/response codec helpers extracted from Sakti API
- `tauri-plugin-builder`: add DB commands (run_sql, run_sql_batch, get_db_info, run_migrations, get_migration_status) alongside existing sync commands

## Impact

- **Rust crates**: `baresync-core` gains real DB/proxy/migration modules (currently stubs); `tauri-plugin-baresync` gains 5 new Tauri commands
- **JS package**: `baresync/server` gains 8+ new exported functions; `baresync/db` gains `createTauriDrizzleDatabase`; `baresync/generator` gains diagnostics/doctor/manifest
- **Source extraction**: Copies from `openspec/external/sakti-pos/apps/pos-app/src-tauri/src/db/` and `openspec/external/sakti-pos/apps/api/src/sync/` — Sakti source is NOT modified
- **Dependencies**: `baresync-core` may gain `sqlx` usage for real pool setup (currently uses it minimally); JS may gain no new dependencies (server primitives are pure logic + drizzle-orm already present)
- **Tests**: Significant new test surface — migration DDL tests, proxy batch tests, server primitive tests, generator diagnostic tests
- **Not affected**: Sakti POS app code stays untouched; batteries-included server deferred; protobuf encoding support unchanged
