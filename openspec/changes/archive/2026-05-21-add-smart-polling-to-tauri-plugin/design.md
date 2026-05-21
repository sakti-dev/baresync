## Context

`tauri-plugin-baresync` exposes one-shot Tauri commands (`sync_now`, `sync_push`, `sync_pull`) that the frontend must call explicitly. There is no background sync mechanism. For mobile apps (POS, field sales), this means data can go stale between user interactions, and the consumer app must implement its own timer logic to keep data fresh.

The plugin already uses `tokio` (via `sqlx`'s `runtime-tokio`) and manages an `Arc<SqlitePool>` in `PluginState`. The `baresync-core` engine handles all sync protocol details — the plugin is a thin Tauri command layer.

## Goals / Non-Goals

**Goals:**
- Automatic background sync that keeps local data fresh without frontend orchestration
- Immediate push after local writes via `run_sql`/`run_sql_batch`
- Debounce: any sync activity (manual or automatic) resets the poll timer
- Pause/resume control so apps can stop polling when backgrounded (battery savings)
- Concurrency guard to prevent overlapping sync operations
- All sync orchestration in Rust (survives webview suspension on mobile)

**Non-Goals:**
- Push notifications or server-initiated sync (server has no notification mechanism)
- Adaptive interval based on network conditions or battery level
- Per-table or per-scope granularity within a single poll loop
- Changes to `baresync-core` crate — all orchestration stays in the plugin layer

## Decisions

### 1. Rust-side tokio task over frontend setInterval

**Decision**: Run the polling loop as a `tokio::spawn` task inside the plugin, not as a JS `setInterval`.

**Rationale**: On mobile (Android/iOS), the webview can be suspended or killed when the app is backgrounded. A Rust task survives this. It also avoids split-brain logic between JS and Rust.

**Alternatives considered**: Frontend-driven polling (simpler Rust but unreliable on mobile), hybrid approach (two sync paths, race condition risk).

### 2. Single loop with tokio::select! and Notify

**Decision**: One background task uses `tokio::select!` on three sources: a timer (`sleep_until`), a write-event signal (`tokio::sync::Notify`), and a control channel (`tokio::sync::mpsc`).

**Rationale**: A single task is easier to reason about — one sync at a time, natural debounce. `Notify` is lightweight for signaling writes. The mpsc channel handles pause/resume/stop commands without polling.

### 3. Debounce via Instant reset

**Decision**: After every sync execution (timer, notify, or manual), set `next_tick = Instant::now() + interval`.

**Rationale**: This means a manual `sync_now()` call from JS effectively postpones the next automatic poll. If the user is actively syncing manually, the background loop stays quiet.

### 4. Concurrency guard via AtomicBool

**Decision**: Use an `AtomicBool` in `PluginState` to mark "sync in progress". Skip sync if already running.

**Rationale**: A `tokio::sync::Mutex` would work but is heavier than needed — we just need to skip, not queue. AtomicBool is lock-free and sufficient.

### 5. PluginState extensions

**Decision**: Add `Arc<Notify>`, `Arc<AtomicBool>`, `mpsc::Sender<ControlMsg>`, and `JoinHandle` to `PluginState`. The task is spawned in `Builder::build` setup.

**Rationale**: Keeps all task lifecycle state co-located with the existing plugin state. The builder pattern already handles setup, so spawning there is natural.

### 6. Polling is opt-in, lifecycle is plugin-managed

**Decision**: Polling does not start automatically. The frontend must call `start_polling(scope_id)` explicitly. When `poll_on_background` is `false`, the plugin automatically pauses on background and resumes on foreground in Rust. Default `poll_interval_secs` is 30, `poll_on_background` defaults to false.

**Rationale**: Existing apps that don't need polling are unaffected. The consumer decides when and how to enable it, while the plugin owns lifecycle behavior so mobile apps do not need JS visibility handlers.

## Risks / Trade-offs

- **[Sync error during background]** → The task logs errors but does not stop. The next timer tick retries. No exponential backoff initially (can be added later).
- **[Task outliving the app]** → The `JoinHandle` is stored in `PluginState`. On window close, the task is aborted via the stop control message.
- **[Write notify without actual data change]** → `run_sql`/`run_sql_batch` always notify. A SELECT-only query would trigger a push that finds nothing to push. This is harmless — the engine handles empty pushes efficiently.
- **[Single scope per poll loop]** → The current design polls one `scope_id`. Multi-scope apps would call `start_polling` per scope. This is acceptable for the initial implementation.
