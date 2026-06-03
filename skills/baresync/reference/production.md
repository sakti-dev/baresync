# Production

Running and maintaining baresync in production — configuration, monitoring, performance, resets, and schema changes.

If a production recommendation depends on exact implementation behavior, load `reference/source.md` and inspect the mapped workspace source.

## Environment-specific settings

### Development

```rust
BaresyncBuilder::new()
    .api_base_url("http://localhost:3000")
    .db_path(":memory:")          // fresh DB on every restart
    .migrations_path("migrations")
    .poll_interval_secs(10)       // fast feedback loop
    .poll_on_background(true)     // don't pause when switching to terminal
```

### Production

```rust
BaresyncBuilder::new()
    .api_base_url("https://api.example.com")
    .db_path("baresync.db")
    .migrations_path("migrations")
    .poll_interval_secs(30)
    .poll_on_background(false)    // save battery on mobile
```

### Testing

```rust
BaresyncBuilder::new()
    .api_base_url("http://localhost:3001")
    .db_path(":memory:")
    .poll_interval_secs(30)       // only used if test calls startPolling()
```

## SQLite settings

Baresync configures SQLite at connection time. You don't need to change these:

| Setting | Value | Purpose |
|---|---|---|
| `journal_mode` | `WAL` | Concurrent reads during writes |
| `synchronous` | `NORMAL` | Balances durability and speed |
| `foreign_keys` | `ON` | Referential integrity |
| `busy_timeout` | `5000` (5s) | Waits instead of failing when DB is locked |

## Monitoring sync health

Three numbers tell you if sync is healthy:

### Dirty count

```ts
const state = await client.getState();
```

| Value | Meaning |
|---|---|
| `0` | All local changes pushed and confirmed |
| `> 0` | Pending changes in outbox waiting to be pushed |

Non-zero is **normal** between sync cycles. If it stays non-zero for minutes after a sync, something is wrong.

### Last server watermark

| Value | Meaning |
|---|---|
| `""` (empty) | Never synced, or cursor was reset. `needs_baseline_sync` will be `true` |
| Non-empty string | Last cursor saved after a successful pull |

Format: `sync:{timestamp}:{table}:{rowId}`. A stale watermark means the client hasn't pulled in a while.

### Needs baseline sync

| Value | Meaning |
|---|---|
| `true` | No cursor exists. Next sync pulls all data from scratch |
| `false` | Cursor exists. Incremental sync only |

`true` on first launch and after a full reset. If `true` after syncing, cursor wasn't saved — check DB write permissions.

### Polling status

```ts
const pollStatus = await client.getPollingStatus();
```

| Scenario | `running` | `paused` | Action |
|---|---|---|---|
| Normal operation | `true` | `false` | None |
| Window unfocused, `poll_on_background = false` | `true` | `true` | Normal — resumes on focus |
| Never started or stopped | `false` | `false` | Call `client.startPolling()` |
| App crashed and restarted | `false` | `false` | Start polling on app init |

### Database info

```ts
const dbInfo = await invoke("plugin:baresync|get_db_info");
// { db_path: "...", size_bytes: 1048576, size_formatted: "1.00 MB" }
```

Growing DB with idle sync = unpurged outbox entries or accumulating soft-deleted rows.

### What to log

| Event | What to log | Why |
|---|---|---|
| Sync cycle completes | `getState()` result, `syncNow()` return value | Track frequency, catch anomalies |
| Dirty count stuck > 5 min | `local_dirty_count`, `last_server_watermark` | Detect stuck pushes early |
| Polling stops unexpectedly | `getPollingStatus()` result | Catch lifecycle bugs |
| DB size exceeds threshold | `get_db_info()` result | Catch data accumulation |

Don't log full sync payloads (contains user data). Log metadata only.

### Interpreting the numbers

**Healthy baseline:**
```
dirty_count:       0
watermark:         "sync:1747894800000:products:prod-42"
needs_baseline:    false
polling running:   true
polling paused:    false
last_sync_at:      "2026-05-22T10:30:00Z"
db size:           ~2 MB
```

**After user creates a row (before next sync):**
```
dirty_count:       1           ← new row is pending
watermark:         unchanged
needs_baseline:    false
```
Normal. Next polling tick will push it.

**After network outage (polling active):**
```
dirty_count:       15          ← accumulated during outage
watermark:         stale       ← hasn't advanced
needs_baseline:    false
polling running:   true
last_sync_at:      old         ← last successful sync before outage
```
Normal during outage. Polling silently retries. Dirty count decreases after connectivity returns.

**Something is wrong:**
```
dirty_count:       42          ← never decreasing
watermark:         "sync:..."  ← advancing (pull works)
needs_baseline:    false
polling running:   true
last_sync_at:      recent      ← sync cycles completing
```
Pull works but push doesn't. Check server logs for push rejection (409, 413, 500). See [debug.md](debug.md).

## Sync status indicator

React component showing sync health:

```tsx
import type { SyncClient } from "baresync/tauri";
import { useEffect, useState } from "react";

type SyncHealth = "synced" | "pending" | "offline" | "error";

function useSyncHealth(client: SyncClient, intervalMs = 5000) {
  const [health, setHealth] = useState<SyncHealth>("synced");
  const [dirtyCount, setDirtyCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function check() {
      try {
        const state = await client.getState();
        if (!mounted) return;
        setDirtyCount(state.local_dirty_count);
        setHealth(state.local_dirty_count === 0 ? "synced" : "pending");
      } catch {
        if (mounted) setHealth("error");
      }
    }
    check();
    const id = setInterval(check, intervalMs);
    return () => { mounted = false; clearInterval(id); };
  }, [client, intervalMs]);

  return { health, dirtyCount };
}
```

Invalidate the `["sync-state"]` query key when `baresync://sync-status-changed` fires.

## Performance tuning

### Push chunking (two-level)

**Level 1 — Target (`target_push_bytes`, default 256 KB):** Packs pending rows into chunks targeting this size.

**Level 2 — Ceiling (`max_push_bytes`, default 2 MB):** If a chunk exceeds this before sending, splits in half without sending.

**Server-side 413 split-retry:** If server rejects with 413, engine splits chunk in half and retries. If a single row is rejected, fails with `SingleRowTooLarge`.

The 256 KB target is safe for every serverless platform (Vercel 4.5 MB, Netlify 6 MB, AWS Lambda 6 MB, Cloudflare 100 MB).

### Polling frequency

| Interval | Sync latency | Server load | Use case |
|---|---|---|---|
| 5–10 sec | Very low | High | Development only |
| 30 sec | 30 sec max | Moderate | Default for most apps |
| 60 sec | 1 min max | Low | Infrequently-changing data |
| No polling | Manual/notification-triggered | None while idle | Apps calling `syncNow()` after actions |

### Push-triggered sync (sub-second latency)

Don't set `poll_interval_secs` to 1. Instead:

1. Don't call `client.startPolling()` at startup
2. Server sends push notification when data changes
3. Client calls `client.syncNow()` on notification

Instant sync without constant polling.

### Battery (mobile)

Keep `poll_on_background` as `false` (default). Polling pauses when window unfocuses, resumes on focus.

### DB size management

**Garbage collection** runs automatically after every sync. Hard-deletes rows where `deleted_at IS NOT NULL AND is_synced = 1`.

**Purge synced outbox entries** periodically:

```ts
await invoke("purge_synced_outbox", {
  olderThan: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
});
```

Schedule during off-peak hours (e.g., app launch, once per day).

### Server-side performance

**Write chunking:** Server uses `getWriteChunkSize()` to split push rows into safe SQLite write chunks:

```ts
const chunkSize = getWriteChunkSize({ columnCount: 10, maxBindParams: 30000, maxRowsPerChunk: 500 });
```

**Idempotency cleanup:** Run `cleanupSyncBatchRequests` on a cron job:

```ts
await cleanupSyncBatchRequests({
  db: sqliteDb,
  olderThanMs: 7 * 24 * 60 * 60 * 1000,       // completed older than 7 days
  stalePendingOlderThanMs: 60 * 60 * 1000,      // stuck pending older than 1 hour
  limit: 1000,
});
```

### Performance checklist

Before going to production:

- [ ] Polling interval matches product needs (30 sec default)
- [ ] `poll_on_background` is `false` on mobile
- [ ] Synced outbox purge is scheduled (daily or weekly)
- [ ] Server has `cleanupSyncBatchRequests` on scheduled cleanup
- [ ] DB file is in writable directory with sufficient disk space
- [ ] `getState()` is called periodically to catch stuck sync early

## Schema changes in production

| Change | Sync impact | Action needed |
|---|---|---|
| **Add column** | None. New columns default to `NULL`. Next pull fills them. | Add migration, update schema, regenerate artifacts |
| **Add table** | None. New table synced on next baseline. | Add migration, add to sync contract, regenerate |
| **Remove column** | Data lost locally. Server may still send it. | Update contract to exclude column, regenerate. Engine ignores unknown columns on pull |
| **Remove table** | Local table exists but no longer synced. | Remove from contract, regenerate. Consider `DROP TABLE` migration |
| **Rename column** | Treated as drop + add. Data lost. | Avoid. If necessary: add new, migrate data, drop old — across two migrations |
| **Change column type** | Depends on SQLite. `STRICT` tables may reject. | Test carefully. Prefer additive changes |

### Migration rules

- **Never edit applied migrations** — engine skips by name, not content. Create a new one.
- **Never rename migration files** — engine tracks by name. Renaming re-runs it.
- **Never put data transformations in migrations** — migrations are DDL. Data migrations belong in app code.

## Resetting local DB

### When to reset

| Symptom | Fix |
|---|---|
| Sync pulls same data repeatedly | Cursor stale. Try `fullResync()` |
| `needs_baseline_sync` always `true` | Cursor not saved. Check DB write permissions. Then `fullResync()` |
| Dirty count never reaches `0` | Check server logs for push rejection, fix, then `syncNow()` or `fullResync()` |
| Migration error on startup | Fix migration, delete DB file, restart |
| Wrong `scope_id` data mixed in | Delete DB and start fresh |

### Level 1: Full resync (no data loss)

```ts
await client.fullResync();
```

Clears cursor, re-pulls everything. Existing local rows updated (upserted). New cursor saved. GC removes synced soft-deletes. Fast and non-destructive — try this first.

### Level 2: Purge synced outbox entries

```ts
await invoke("purge_synced_outbox", {
  olderThan: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
});
```

Housekeeping operation. Deletes outbox entries synced more than 7 days ago. Do NOT use to clear pending rows (pending = `synced_at IS NULL`; deleting loses local changes).

### Level 3: Delete the DB file (clean slate)

Implement as app-level reset flow:

1. Confirm with user (unsynced changes may be lost)
2. Stop polling
3. Persist "reset on next launch" flag
4. Restart app
5. Before registering plugin, delete DB file + WAL/SHM files
6. Register plugin, let migrations run from scratch

On restart: fresh DB, all migrations run, `needs_baseline_sync = true`, first sync pulls everything.

### Level 4: Delete DB + WAL file

Delete all three files if DB is genuinely corrupted:

```
baresync.db
baresync.db-wal
baresync.db-shm
```

Only needed if SQLite errors on open. Normally SQLite cleans up WAL/SHM on close.

### Reset button in UI

```tsx
function SyncSettings({ client }: { client: SyncClient }) {
  const [confirming, setConfirming] = useState(false);

  const handleResync = async () => { await client.fullResync(); };
  const handleFullReset = async () => {
    await client.stopPolling();
    await requestLocalDatabaseResetOnNextLaunch(); // app-specific
    await relaunchApp();                            // app-specific
  };

  return (
    <div>
      <button onClick={handleResync}>Re-sync from server</button>
      <button onClick={() => setConfirming(true)} style={{ color: "red" }}>
        Reset local database
      </button>
      {confirming && (
        <dialog open>
          <p>This deletes all local data and re-syncs from the server.</p>
          <button onClick={handleFullReset}>Confirm</button>
          <button onClick={() => setConfirming(false)}>Cancel</button>
        </dialog>
      )}
    </div>
  );
}
```

### What NOT to do

- **Don't manually delete rows from `sync_outbox`** — pending entries have `synced_at = NULL`; deleting loses local changes forever
- **Don't manually clear `sync_cursors` via SQL** — use `fullResync()` instead
- **Don't delete DB while app is running** — plugin holds open SQLite connection. Restart first

## Operational troubleshooting

For error types, HTTP status codes, and diagnostic flowcharts, see [debug.md](debug.md).

### Dirty count never reaches 0

```ts
const result = await client.syncNow();
if (result.push?.tables_synced.length === 0) {
  console.log("Rejected tables:", result.push?.rejected_tables);
}
```

Common causes:
- Server rejecting with 409 — check `sync_batch_requests` table
- Server rejecting with 413 — `SingleRowTooLarge` can't be auto-retried
- Scope mismatch — `sync_outbox.scope_id` vs client config

### Data appears on one device but not another

- Sending device hasn't pushed (dirty count > 0)
- Receiving device's cursor is ahead (stale watermark)
- Different `scopeId` values on each device
- Server bug in scope resolution

### `needs_baseline_sync` stays `true` after syncing

Cursor not being saved. SQLite writes failing silently.

Check:
1. DB file path is writable
2. Disk isn't full
3. DB file isn't read-only (Android: wrong directory)

### App crashes on startup after migration

Bad migration SQL. Fix SQL, delete DB, restart:

```ts
await requestLocalDatabaseResetOnNextLaunch();
await relaunchApp();
```

### Inspecting internal tables (last resort)

Query through Drizzle for debugging only — don't build features on these:

```ts
import { syncCursors, syncOutbox } from "@repo/sync-contract/local-schema";

const pending = await db.select().from(syncOutbox).where(sql`synced_at IS NULL`);
const cursors = await db.select().from(syncCursors);
```

Key `sync_outbox` columns: `table_name`, `row_id`, `operation`, `scope_id`, `synced_at` (NULL = pending), `changed_at`.

Key `sync_cursors` columns: `scopeId`, `lastCursor`, `updatedAt`.
