# Tauri Plugin

Full reference for the Tauri plugin — builder config, commands, polling, events, migrations, and testing.

If the exact plugin behavior is unclear, load `reference/source.md` and inspect the mapped workspace source.

## Crates

| Crate | Purpose |
|---|---|
| `baresync-core` | Sync engine, push/pull, migrations, drizzle proxy, state |
| `tauri-plugin-baresync` | Plugin builder, command handlers, polling loop, event emission |

Your app depends on `tauri-plugin-baresync`. Add `baresync-core` directly only when you need its Rust types or embedded migration helpers.

## Builder

```rust
use tauri_plugin_baresync::builder::Builder as BaresyncBuilder;

BaresyncBuilder::new()
    .api_base_url("http://127.0.0.1:3001")
    .db_path("baresync.db")
    .contract_json(include_str!("../../../../packages/sync-contract/generated/sync-contract.json"))
    .migrations_path("migrations")
    .poll_interval_secs(30)
    .poll_on_background(false)
    .build()
```

### All builder methods

| Method | Type | Default | Description |
|---|---|---|---|
| `api_base_url` | `impl Into<String>` | `""` | Server base URL |
| `db_path` | `impl Into<String>` | `None` | SQLite file path. Relative = app data dir, absolute = as-is |
| `contract_json` | `impl Into<String>` | `None` | Generated `sync-contract.json` content |
| `contract_tables` | `SyncContractTables` | empty | Manual upsert/delete order + local-only columns |
| `migrations_path` | `impl Into<PathBuf>` | `None` | Path to bundled `.sql` migration files |
| `migrations` | `Vec<EmbeddedMigration>` | empty | Embedded SQL migrations compiled into binary |
| `poll_interval_secs` | `u64` | `30` | Seconds between polling cycles |
| `poll_on_background` | `bool` | `false` | Poll when window is unfocused |
| `encryption_key_provider` | `impl EncryptionKeyProvider` | `None` | Custom encryption key for SQLite |

### db_path details

```rust
// Relative → app data dir: ~/.local/share/com.app/baresync.db
.db_path("baresync.db")

// Relative with subdirectory → ~/.local/share/com.app/databases/mydb.db
.db_path("databases/mydb.db")

// Absolute (for tests)
.db_path("/tmp/test.db")
```

Override with env var for testing:

```rust
fn db_path() -> String {
    std::env::var("MY_APP_DB_PATH").unwrap_or_else(|_| {
        let mut path = std::env::temp_dir();
        path.push("my-app.db");
        path.to_string_lossy().to_string()
    })
}
```

### contract_tables vs contract_json

Use `contract_json` with `include_str!` to avoid duplicating table order in Rust:

```rust
.contract_json(include_str!("../../../../packages/sync-contract/generated/sync-contract.json"))
```

Use `contract_tables` only for tests or advanced integrations where you need manual control:

```rust
.contract_tables(SyncContractTables {
    upsert_order: vec!["locations".to_string(), "items".to_string()],
    delete_order: vec!["items".to_string(), "locations".to_string()],
    local_only_columns: vec!["is_synced".to_string()],
})
```

### poll_on_background

- `false` (default): Pauses polling when window loses focus, resumes on focus. Saves resources on desktop.
- `true`: Polling continues regardless of focus. Use for background services or mobile apps.

On mobile, the plugin relies on Tauri's webview lifecycle (suspended → pause, resumed → resume).

### What happens during setup

1. Resolves `db_path`, connects to SQLite (creates if missing, WAL mode, foreign keys on)
2. Runs `migrations_path` migrations in strict mode (if configured)
3. Runs embedded migrations in strict mode (if no migration path)
4. Stores `PluginState` in Tauri's managed state

Fails with a descriptive error if any step fails.

## Commands

All commands return `Result<T, String>`. Errors are converted to strings and sent back to JS as rejected promises.

### Database proxy

| Command | JS invoke | Description |
|---|---|---|
| `run_sql` | `"plugin:baresync\|run_sql"` | Execute a single SQL query |
| `run_sql_batch` | `"plugin:baresync\|run_sql_batch"` | Execute multiple statements in a transaction |
| `get_db_info` | `"plugin:baresync\|get_db_info"` | Return database file path and size |

`run_sql` accepts `SqlQuery { sql, params, method }`. Method `"run"` returns `rows_affected`. Method `"all"` returns rows.

Both `run_sql` and `run_sql_batch` emit `baresync://data-changed` when `rows_affected > 0`. `run_sql` triggers an early sync only outside of transactions (uses transaction-depth tracking). `run_sql_batch` always triggers an early sync on success regardless of `rows_affected`.

### Sync

| Command | JS invoke | Returns |
|---|---|---|
| `sync_now` | `"plugin:baresync\|sync_now"` | `SyncNowResult` (includes `mode`) |
| `sync_push` | `"plugin:baresync\|sync_push"` | `PushResult` |
| `sync_pull` | `"plugin:baresync\|sync_pull"` | `PullResult` |
| `sync_full_resync` | `"plugin:baresync\|sync_full_resync"` | `SyncNowResult` |
| `get_sync_local_state` | `"plugin:baresync\|get_sync_local_state"` | `LocalSyncState` |

All sync commands take `scope_id: String`, except `purge_synced_outbox` which takes `older_than: String` (it operates across all scopes).

### Maintenance

| Command | JS invoke | Description |
|---|---|---|
| `purge_synced_outbox` | `"plugin:baresync\|purge_synced_outbox"` | Delete synced outbox entries older than a timestamp |
| `run_garbage_collection` | `"plugin:baresync\|run_garbage_collection"` | Remove soft-deleted synced rows |

### Polling

| Command | JS invoke | Description |
|---|---|---|
| `start_polling` | `"plugin:baresync\|start_polling"` | Start polling loop for a scope |
| `stop_polling` | `"plugin:baresync\|stop_polling"` | Stop polling loop |
| `pause_polling` | `"plugin:baresync\|pause_polling"` | Pause without stopping |
| `resume_polling` | `"plugin:baresync\|resume_polling"` | Resume from pause |
| `get_polling_status` | `"plugin:baresync\|get_polling_status"` | Return running, paused, last_sync_at |

### Migrations

| Command | JS invoke | Description |
|---|---|---|
| `run_migrations` | `"plugin:baresync\|run_migrations"` | Re-run migrations manually |
| `get_migration_status` | `"plugin:baresync\|get_migration_status"` | List applied migrations with hashes |

Migrations run automatically during setup. `run_migrations` is only needed for hot updates.

## Polling

### Lifecycle

1. `startPolling(scope_id)` spawns a Tokio task
2. Every `poll_interval_secs` seconds, calls `sync_fn(scope_id)`
3. If data changed, emits `baresync://data-changed` and `baresync://sync-status-changed`
4. Resets timer after each cycle

### Early sync on write

When `run_sql` or `run_sql_batch` detects `rows_affected > 0`, it calls `notify_one()` on the polling loop. This wakes the loop immediately (if not paused or already syncing), so local writes push sooner than the next tick.

### Concurrency guard

An `AtomicBool` (`sync_in_progress`) prevents overlapping sync cycles. If a sync is already running when the timer fires or a notify arrives, the cycle is skipped.

### Pause and resume

- `pausePolling()` → skips ticks, loop stays alive
- `resumePolling()` → resumes, resets timer
- Both emit `baresync://sync-status-changed`

### Window focus (desktop)

When `poll_on_background` is `false`:
- Window loses focus → `pausePolling`
- Window gains focus → `resumePolling`

### Mobile lifecycle

- Webview suspended → `pausePolling`
- Webview resumed → `resumePolling`

### Stop

`stopPolling()` exits the loop cleanly, resets `last_sync_at`, sets `paused` to `false`. Call `startPolling` to restart.

### Polling status

```ts
const status = await invoke("plugin:baresync|get_polling_status");
// { running: boolean, paused: boolean, last_sync_at: string | null }
```

## Events

| Event | When |
|---|---|
| `baresync://data-changed` | Rows changed by sync engine or Drizzle proxy write |
| `baresync://sync-status-changed` | Sync cycle completed, or polling started/stopped/paused/resumed |

### Important details

- Events fire from Rust, not JS — you cannot control when they fire
- Multiple writes in quick succession may produce multiple events (React Query batches invalidations)
- Event payload is empty `{}` — use it as a signal to invalidate caches, not as a diff
- Do not use events to determine which rows changed — query the database instead

## Migrations

### Path-based (recommended)

```rust
builder.migrations_path("migrations")
```

Bundle `.sql` files as Tauri resources:

```json
{ "bundle": { "resources": ["migrations/*.sql"] } }
```

Files sorted by filename, applied in order. Only `.sql` files included.

### Embedded

```rust
builder.migrations(vec![
    EmbeddedMigration { name: "0001_init", sql: "CREATE TABLE ..." },
])
```

SQL compiled into the binary. Use when you don't want to ship `.sql` files.

### Statement breakpoints

Split multiple statements in one migration:

```sql
CREATE TABLE locations (id TEXT PRIMARY KEY);
--> statement-breakpoint
CREATE TABLE items (id TEXT PRIMARY KEY);
```

Each segment executes as a separate statement within a single transaction.

### Strict mode

- Each migration runs in a transaction
- If any statement fails, entire migration rolls back
- Already-applied migrations skipped (tracked by hash in `__drizzle_migrations`)

### Migration tracking table

`__drizzle_migrations`:

| Column | Type | Description |
|---|---|---|
| `id` | `INTEGER` | Auto-increment PK |
| `hash` | `TEXT` | Migration name (unique) |
| `created_at` | `INTEGER` | Unix timestamp in ms |

### Adding a new migration

1. Create `migrations/0004_add_column.sql`
2. Rebuild — build script picks it up
3. Plugin applies it on next launch

## Host testing

Command logic is separated from Tauri's `State`. Each command has a `_with_state` variant:

```rust
use tauri_plugin_baresync::commands::{sync_now_with_state, PluginState, PluginEventSink};

async fn test_state() -> PluginState {
    let db = DbClient::connect(":memory:").await.unwrap();
    PluginState {
        db: Arc::new(db),
        sync_config: SyncEngineConfig {
            api_url: "http://localhost:0".to_string(),
            scope_id: "test".to_string(),
            ..Default::default()
        },
        contract_tables: SyncContractTables {
            upsert_order: vec!["items".to_string()],
            delete_order: vec!["items".to_string()],
            local_only_columns: vec!["is_synced".to_string()],
        },
        // ... other fields
    }
}
```

### Custom HTTP transport

Mock the HTTP layer for testing:

```rust
struct MockTransport;

#[async_trait::async_trait]
impl SyncHttpTransport for MockTransport {
    async fn send_push_request(&self, api_url: String, envelope: Value) -> SyncTransportFuture {
        // return mock push response
    }
    async fn send_status_request(&self, api_url: String, body: Vec<u8>) -> SyncTransportFuture {
        // return mock status response
    }
    async fn send_pull_request(&self, api_url: String, body: Vec<u8>) -> SyncTransportFuture {
        // return mock pull response
    }
}
```
