## Context

Baresync has a working thin vertical: JSON push/pull, adaptive chunking, Tauri plugin builder, JS sync client, and server idempotency. Wave 1 (shells) is done. The next PRD milestone is Wave 2 — four parallel extraction streams. Stream D (schema helpers) is already complete. This change tackles the remaining three streams:

- **Stream A**: Generator diagnostics (P5) — make the generator a preflight validator
- **Stream B**: Local DB runtime extraction (P4) — make the plugin actually usable for DB operations
- **Stream C**: Server primitives completion (P6) — fill remaining gaps in low-level server helpers

All three streams touch different packages/crates/languages and can run in parallel. Source material lives in `openspec/external/sakti-pos/` — we extract by copying, not moving. Batteries-included server (`createSyncServer`) is explicitly deferred.

## Goals / Non-Goals

**Goals:**
- Extract real SQLite pool setup, Drizzle proxy commands, and migration runner from Sakti POS into `crates/baresync-core`
- Add 5 DB Tauri commands: `run_sql`, `run_sql_batch`, `get_db_info`, `run_migrations`, `get_migration_status`
- Add JS `createTauriDrizzleDatabase` in `packages/baresync/src/db/`
- Add generator diagnostics system with all 15 error codes and 9 warning codes from PRD
- Add `baresync doctor`, `baresync generate --check`, `--warnings-as-errors`
- Add `sync-contract.manifest.json` output
- Complete missing server primitives: `orderDeleteChanges`, `parseSyncCursor`, `formatSyncCursor`, `mapSyncError`, `countPushRows`
- All extraction preserves Sakti POS source untouched

**Non-Goals:**
- Batteries-included server (`createSyncServer`) — deferred to a later change
- Framework adapters (Elysia, Hono, Fetch) — deferred
- App migration (P15) — Sakti POS stays on its own modules
- Generated Rust mappers (P11) — deferred
- Device-like simulation (P14) — deferred
- Protobuf encoding support — JSON-only for now, protobuf types reserved but not implemented

## Decisions

### D1: Rust DB types extracted directly from Sakti POS `drizzle_proxy.rs`

The Sakti POS `drizzle_proxy.rs` contains `SqlQuery`, `SqlRow`, `SqlStatement`, `BatchResult`, `DbInfo`, `bind_value`, `sqlx_value_to_json`, pool init, and migration runner — all in one file. We split these across `baresync-core` modules:

- `db.rs` — pool setup (`init_db`), value conversion (`sqlx_value_to_json`), path resolution, `get_db_info`
- `drizzle_proxy.rs` — `run_sql`, `run_sql_batch`, `SqlQuery`, `SqlRow`, `SqlStatement`, `BatchResult`, `bind_value`
- `migrations.rs` — `MigrationFile`, `collect_migration_files`, `run_migrations`, `EmbeddedMigration`

Rationale: The Sakti file is a single 291-line module. Splitting into three core modules gives each a single responsibility and makes testing easier. The Tauri plugin crate re-exports commands through its own thin `commands.rs`.

### D2: Migration runner extracted with strict mode as public default

The Sakti migration runner has tolerant behavior (`already exists`, `duplicate column` are skipped). We extract this as `strict: false` (compat mode) and add `strict: true` as the public default, which fails on any error instead of silently skipping.

The `run_migrations` function accepts a `MigrationConfig`:
```rust
pub struct MigrationConfig {
    pub strict: bool,       // default true for public API
    pub migrations: &'static [EmbeddedMigration],
}
```

### D3: Embedded migrations via `include_str!` through build.rs

Following Sakti's existing pattern: a `build.rs` script reads SQL files from a configured migrations directory, generates a Rust file with embedded SQL strings, and the migration runner consumes `&'static [EmbeddedMigration]`. The plugin builder accepts a `migrations_dir` config that triggers the build script.

For the initial extraction, we keep the `include_str!` macro approach since it's proven in Sakti. The consumer's `build.rs` generates the `MIGRATIONS` slice.

### D4: Generator diagnostics run before file writes

The diagnostics model follows PRD exactly:

```ts
interface SyncDiagnostic {
  code: string;                    // e.g. "SYNC_SCHEMA_MISSING_SCOPE_COLUMN"
  severity: "error" | "warning" | "info";
  message: string;
  table?: string;
  column?: string;
  why: string;
  fix: string;
  docs?: string;
}
```

`runDiagnostics(contract)` runs all checks and returns `SyncDiagnostic[]`. `generateSyncArtifacts` calls `runDiagnostics` first — if any `error` exists, it prints all diagnostics and exits without writing files. Warnings print but continue unless `--warnings-as-errors`.

### D5: Manifest is a small JSON sidecar

`sync-contract.manifest.json` is written alongside generated artifacts. It contains: contract version, generator version, encoding, table names, field names, scope mappings, table order, generated output paths. This enables future drift detection without changing the generator's main output.

### D6: Server cursor primitives extracted from Sakti `service.ts`

Sakti's `parsePullBatchCursor` and `formatPullBatchCursor` use a `"sync:timestamp:tableName:rowId"` format. We extract these as generic `parseSyncCursor` / `formatSyncCursor` with the same wire format but scope-agnostic naming. The cursor prefix stays `"sync:"`.

### D7: `orderDeleteChanges` reverses upsert order

The PRD says deletes go child-before-parent, which is the reverse of upsert order. `orderDeleteChanges` takes the same `order` array but reverses it.

### D8: `mapSyncError` maps HTTP status + body to stable error codes

```ts
function mapSyncError(error: unknown): {
  code: string;    // stable error code from PRD
  message: string;
}
```

Maps: 401 → `sync_unauthorized`, 413 → `sync_payload_too_large`, 409 → `sync_idempotency_conflict`, 400 with cursor → `sync_cursor_invalid`, etc.

## Risks / Trade-offs

- **[SQLite transactional DDL differs by version]** → Mitigation: Test against the same SQLite version used on Android (bundled with sqlx). Document version assumption.
- **[Migration runner tolerant mode hides real drift]** → Mitigation: `strict: true` is the public default. Tolerant mode requires explicit opt-in and is documented as a compat escape hatch.
- **[Generator diagnostics are extensive (24 codes)]** → Mitigation: Implement all codes but batch in 2-3 groups. Error codes first (blocks generation), warning codes second (informational).
- **[Three streams in one change is large]** → Mitigation: Streams touch different files with zero overlap. Tasks are grouped by stream and can be parallelized by different agents.
- **[Extracting from Sakti may pull Sakti-specific patterns]** → Mitigation: Extract pure functions first, then wrap in generic API. Strip Sakti-specific logging (`pos_log!`) in favor of generic error returns.
