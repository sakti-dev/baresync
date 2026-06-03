# Verify

Use when the user asks whether a Baresync setup, generated artifacts, server handlers, Tauri plugin, or local writes are correct.

## Verification Stance

Findings come first. Do not reassure before checking evidence.

Verify by layer:

1. Prerequisites
2. Schema
3. Generator
4. Server
5. Client writes
6. Tauri plugin
7. UI invalidation
8. Tests and commands

## Prerequisites

- Tauri 2.x desktop app exists.
- Server is JavaScript/TypeScript.
- Server uses Drizzle for synced tables.
- Shared sync contract package exists or generated files are reachable by both server and app.

## Schema Checks

- `api-synced-schema.ts` and `local-synced-schema.ts` both exist.
- Both files export the same synced table names.
- Local schema uses `localSyncColumns()`.
- API schema uses `apiSyncColumns()`.
- Business columns match between local and API schemas.
- Scope column exists on every synced table.
- Primary key is a single text `id`.
- Synced tables use soft-delete metadata.

## Generator Checks

- `sync.config.ts` uses path strings for `apiSyncedSchema` and `localSyncedSchema`.
- `tables` contains every synced table that should be in the contract.
- Each configured `scopeColumn` maps to a real column.
- `outputDir` points to the generated contract package location.
- `bunx baresync doctor` passes.
- `bunx baresync generate` produces a dated generated directory.
- Generated snapshots include `api-synced-schema.ts` and `local-synced-schema.ts`.
- Server imports snapshots from generated dated paths, not mutable source schemas.

## Server Checks

- Push, pull, and status routes are mounted at the URLs used by the plugin.
- `createSyncPushHandler` has `idempotency`.
- `resolveScope` authenticates and authorizes the requested scope.
- Repository implements build/read/upsert/soft-delete behavior for every synced table.
- Push handler uses generated `SYNC_UPSERT_ORDER`.
- Delete behavior uses generated `SYNC_DELETE_ORDER` or equivalent reverse order.

## Client Write Checks

- Synced writes use `writeTransaction`.
- Synced writes call `writeLocalChange`.
- Local rows are marked `isSynced: false` after local mutation.
- Deletes set `deletedAt` instead of hard deleting.
- Outbox row has the same table, row ID, operation, and scope.

## Tauri Plugin Checks

- `lib.rs` registers `tauri_plugin_baresync`.
- Plugin `api_base_url` points to the server base URL.
- Plugin embeds `sync-contract.json` with the correct `include_str!` path.
- `contract_tables` matches generated table order.
- `db_path` is stable across restarts.
- `migrations_path` points to local SQL migrations.
- Poll interval is intentional for the environment.

## UI Checks

- UI reads local SQLite, not the remote server directly for synced data.
- Sync events invalidate the same query keys used by data reads.
- Manual sync/status controls call `createSyncClient` methods with the correct scope.

## Output Format

Report:

1. Findings by severity
2. Missing evidence
3. Commands to run
4. Smallest next fix

Use this severity scale:

- **Critical:** Sync cannot run or data can be lost.
- **High:** Sync runs but a layer is miswired or insecure.
- **Medium:** Sync likely works but has drift, observability, or maintenance risk.
- **Low:** Cleanup, naming, or documentation improvement.
