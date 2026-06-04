# Debug

Troubleshooting sync issues, errors, and common problems.

## Triage First

Classify the failure before proposing fixes.

| Symptom | Check first | Reference/source fallback |
|---|---|---|
| Generated import fails | Generated dated directory and schema snapshots | `reference/generator.md`, `reference/source.md` |
| App starts but no sync logs | Rust logging setup | `reference/tauri-plugin.md`, `reference/source.md` |
| Outbox grows | Push route, auth/scope, server errors | `reference/server.md`, `reference/verify.md` |
| Pull returns no data | Cursor, scope auth, server repository reads | `reference/server.md`, `reference/source.md` |
| Local writes not pushed | `writeTransaction` + `writeLocalChange` | `reference/write.md`, `reference/source.md` |
| Table not found | Local migrations and plugin migration path | `reference/tauri-plugin.md`, `reference/source.md` |
| UI stale after sync | Event bridge and query invalidation keys | `reference/ui-frameworks.md`, `reference/source.md` |
| Doctor/generate fails | Schema diagnostics | `reference/generator.md`, `reference/source.md` |

## Debug Output Contract

When diagnosing, respond with:

1. Failure class
2. Evidence from prompt/workspace/logs
3. Most likely cause
4. Next command or file to inspect
5. Smallest safe fix

Do not list every possible cause unless the evidence is insufficient.

## App fails to start

Run `cargo check` in `apps/app/src-tauri`. Most common cause: mismatched `tauri-plugin-baresync` version in `Cargo.toml`.

## Server does not start

Ensure `apps/server/data/` exists and is writable. Override path:

```bash
MY_APP_SERVER_DB_PATH=/tmp/my-app.db bun run dev
```

If using Drizzle migrations on server, generate them first:

```bash
cd apps/server && bun run db:generate
```

## No data appears in app

1. **Is server running?** Check `http://127.0.0.1:3001/health`
2. **Is there data on the server?** Seed the server database
3. **Did polling start?** Open Tauri devtools console, look for sync logs
4. **Are query keys correct?** React Query cache keys in `useDrizzleQuery` must match the invalidation keys in `SyncClientProvider`

## Sync not working (no errors)

The Rust plugin uses the `log` crate. Without a logging frontend, all sync logs are silent.

Add to `Cargo.toml`:

```toml
[dependencies]
env_logger = "0.11"
```

Init in `lib.rs` before building:

```rust
env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
    .init();
```

Run with debug logging:

```bash
RUST_LOG=debug bun run dev
```

### Key log messages

| Log | Meaning |
|-----|---------|
| `[baresync] plugin setup: api_url=...` | Plugin loaded with correct config |
| `[baresync] contract tables: upsert_order=[...]` | Contract parsed (empty = no tables) |
| `[baresync] HTTP POST ... -> 404` | Server URL mismatch — check `api_base_url` |
| `[baresync] polling sync_fn failed` | Sync cycle failed with error |

## Sync outbox not draining

1. Check `contract_tables` in `lib.rs` has correct upsert/delete order
2. Check server `/push` returns 200
3. Check server console for errors in `applyPushChanges`

## "table not found" errors

Migration SQL must include all synced tables plus `sync_outbox` and `sync_cursors`. Add a new migration file (e.g., `0002_add_notes.sql`) and rebuild the Tauri app. Plugin applies pending migrations on next startup.

## Build script does not find migrations

Ensure `.sql` files are in `apps/app/src-tauri/migrations/` and `build.rs` points there. Run `cargo clean` if stale build artifacts.

## Duplicate outbox entries

The `sync_outbox` has a unique partial index on `(table_name, row_id) WHERE synced_at IS NULL`. Writing to the same row while a pending entry exists causes a constraint violation. If you see unexpected constraint errors, the migration likely missed the index.

## Server-wins overwriting local data

This is expected behavior. When the same row changes on both client and server, server state wins during pull. If you need different conflict resolution, you'd need to modify the sync engine (not supported out of the box).

## Outbox growing / sync not draining

A growing outbox (`localDirtyCount` in `getSyncLocalState`) means pushes are failing or not running.

1. Check server is reachable (`http://127.0.0.1:3001/health`)
2. Check server console for errors in `applyPushChanges`
3. Check `contract_tables` in `lib.rs` has correct upsert/delete order
4. Run with `RUST_LOG=debug` and look for `[baresync] polling sync_fn failed`

If the outbox is healthy but large, it just means many writes are pending — the next successful push will drain it.

## Garbage collection

After every sync, the engine hard-deletes rows that are both soft-deleted (`deleted_at IS NOT NULL`) and synced (`is_synced = 1`). This runs automatically — you don't need to trigger it manually.

If you see rows with `deleted_at` set but not removed, they either haven't been synced yet or GC hasn't run. You can trigger it explicitly:

```ts
await client.runGarbageCollection({ scopeId: "merchant-1" });
```

## Outbox purging

Over time, `sync_outbox` accumulates synced entries. You can purge old ones:

```ts
await client.purgeSyncedOutbox({ olderThan: "2026-01-01T00:00:00.000Z" });
```

This deletes entries where `synced_at IS NOT NULL AND synced_at < olderThan`. Run periodically (e.g. weekly) as a background task. Never purge during active debugging — old entries help trace issues.

## Schema diagnostics

Run `bunx baresync doctor` to validate your schemas before generating. This catches common errors early.

```bash
bunx baresync doctor
# or with a specific config
bunx baresync doctor --config packages/sync-contract/sync.config.ts
```

Treat warnings as errors in CI:

```bash
bunx baresync generate --warnings-as-errors
```

### Common error codes

| Code | What it means |
|---|---|
| `SYNC_SCHEMA_MISSING_PRIMARY_KEY` | Table has no primary key |
| `SYNC_SCHEMA_UNSUPPORTED_PRIMARY_KEY` | PK is not a single `text("id")` |
| `SYNC_SCHEMA_MISSING_SCOPE_COLUMN` | Scope field doesn't map to a real column |
| `SYNC_SCHEMA_MISSING_DELETED_AT` | No `deleted_at` column |
| `SYNC_SCHEMA_MISSING_ROW_STATE_COLUMN` | Missing `created_at` or `updated_at` |
| `SYNC_SCHEMA_MISSING_LOCAL_IS_SYNCED` | Missing `is_synced` on local schema |
| `SYNC_SCHEMA_UNSUPPORTED_COLUMN_TYPE` | Column type baresync can't serialize |
| `SYNC_SCHEMA_DUPLICATE_TABLE_NAME` | Same table name appears twice |
| `SYNC_SCHEMA_FK_CYCLE` | Foreign key cycle between synced tables |
| `SYNC_SCHEMA_REQUIRED_EXTERNAL_FK` | NOT NULL FK to a non-synced table |

### Common warning codes

| Code | What it means |
|---|---|
| `SYNC_SCHEMA_MISSING_SYNC_UPDATED_AT` | Missing `sync_updated_at` on API schema |
| `SYNC_SCHEMA_NULLABLE_SCOPE_COLUMN` | Scope column is nullable (should be NOT NULL) |
| `SYNC_INDEX_MISSING_SCOPE_WATERMARK` | No `(scope, sync_updated_at)` index |
| `SYNC_INDEX_MISSING_LOCAL_DIRTY` | No `is_synced` index |

See [generator reference](generator.md) for programmatic diagnostics (`runDiagnostics()`) and CLI flags (`--check`, `--warnings-as-errors`).

## Error handling

The JS client does not wrap or transform errors. Every method rejects with whatever the Tauri plugin or Drizzle produces.

| Source | Example |
|---|---|
| Tauri IPC | Network failure, plugin not registered, command panic |
| Drizzle/SQLite | Schema mismatch, constraint violation, locked database |
| Server | Auth expired, rate limited, validation error |

### Server error codes

The server returns structured JSON errors. Interpret the `code` field:

| Code | HTTP | What it means | Fix |
|---|---|---|---|
| `sync_unauthorized` | 401 | Auth failed in `resolveScope` | Check auth headers, session validity |
| `sync_scope_invalid` | 403 | Scope not authorized | Verify user has access to this scope |
| `sync_payload_too_large` | 413 | Push body exceeds 2 MB or 2000 rows | Split into smaller batches |
| `sync_idempotency_conflict` | 409 | Duplicate push batch | Safe to retry with new `idempotencyKey` |
| `sync_cursor_invalid` | 400 | Unparseable cursor | Call `fullResync()` to reset |
| `sync_network_error` | 500 | TypeError (fetch failed) | Check server URL, network connectivity |
| `sync_unknown` | 500 | Unhandled server error | Check server logs |

### Rust SyncError variants

The Rust core uses `SyncError` enum variants. They're serialized to strings when crossing the Tauri IPC boundary — so in JS they appear as error strings containing these keywords:

| Variant | JS error contains | When |
|---|---|---|
| `Network(msg)` | `"Network"` | HTTP request fails, timeout, DNS, connection refused |
| `Validation(msg)` | `"Validation"` | Bad cursor, missing scope, malformed envelope |
| `Database(msg)` | `"Database"` | SQLite constraint violation, locked, disk I/O |
| `JsonParse(msg)` | `"JsonParse"` | JSON parse/serialize failure |
| `Migration(msg)` | `"Migration"` | Migration SQL fails to apply |
| `Http { status, body, kind }` | `"Http"` | Server returned non-2xx (see HTTP classification below) |
| `SingleRowTooLarge { table, id }` | `"SingleRowTooLarge"` | One row exceeds `max_push_bytes` |

### HTTP error classification

When the Rust engine gets a non-2xx server response, it classifies the status code:

| Status Code | Kind | Meaning |
|---|---|---|
| `401`, `403` | `"auth"` | Authentication or authorization failure |
| `413` | `"payload_too_large"` | Push payload exceeds server limit |
| `500`–`599` | `"server"` | Server-side error |
| Other | `"unknown"` | Unexpected status code |

The `kind` appears in the error string. Check for it:

```ts
try {
  await client.syncNow();
} catch (e) {
  if (e.includes("payload_too_large")) {
    // Push too big — reduce batch size
  } else if (e.includes("auth")) {
    // Token expired — re-authenticate
  }
}
```

### ConflictRequestError

Thrown by the idempotency guard on the server when a duplicate push is detected. Has `status: 409`. The JS client sees this as a server error with code `sync_idempotency_conflict`.

### Retry pattern

The client does not retry on its own. Wrap with backoff if needed:

```ts
async function syncWithRetry(maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await client.syncNow();
      return;
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}
```

### Polling errors

If a polling cycle fails, the plugin emits `baresync://sync-status-changed` and continues. The loop does not stop on failure. Check `getPollingStatus()` to verify polling is still running.

### What not to do

- Do not catch and swallow errors silently — at minimum log them
- Do not retry indefinitely without backoff
- Do not assume errors are strings — plugin may return structured objects

## Mock testing

Pass a custom `invoke` to `createSyncClient` for unit tests:

```ts
const client = createSyncClient({
  scopeId: "test",
  invoke: (cmd) => {
    const results: Record<string, unknown> = {
      sync_now: { ok: true },
      get_sync_local_state: { local_dirty_count: 0, last_server_watermark: "", needs_baseline_sync: false },
      get_polling_status: { running: true, paused: false, last_sync_at: null },
    };
    return Promise.resolve(results[cmd] ?? {});
  },
});

await client.syncNow(); // works without Tauri
```

Write helpers (`writeLocalChange`, `enqueueChange`) don't use `invoke` — they insert into `sync_outbox` via the Drizzle transaction. Mock the transaction object to test them.

## Database file info

Check database size and path:

```ts
const info = await client.getDbInfo();
// { db_path: "/path/to/baresync.db", size_bytes: 524288, size_formatted: "512 KB" }
```

A rapidly growing database may indicate soft-deleted rows accumulating (run `runGarbageCollection`) or synced outbox entries not being purged (run `purgeSyncedOutbox`).

Use alongside other diagnostics:

```ts
const [info, migrations, state] = await Promise.all([
  client.getDbInfo(),
  client.getMigrationStatus(),
  client.getState(),
]);
```

## Testing

If you need to test sync integration, see [reference/testing.md](testing.md) — covers mock `invoke` patterns, event bridge testing, Drizzle proxy mocking, and E2E debugging sequences.

## Production

For health monitoring (three metrics, interpreting numbers), performance tuning (chunking, polling frequency, battery), and resetting the local database (4 levels), see [reference/production.md](production.md).
