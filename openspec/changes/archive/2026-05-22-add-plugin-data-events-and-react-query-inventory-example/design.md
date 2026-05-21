## Context

The Tauri plugin now owns smart polling, write-triggered sync, and background lifecycle behavior. The inventory example has moved toward a React app with Drizzle reads, but its hooks still refresh by interval. That teaches consumers to poll blindly even though the plugin is the component with the best knowledge of when local SQLite data or sync status changed.

The plugin command helpers are also used directly from host Rust tests. Event emission must therefore remain testable without launching a Tauri app or WebView.

## Goals / Non-Goals

**Goals:**
- Emit a `baresync://data-changed` event only when local observable data changed.
- Emit a `baresync://sync-status-changed` event when polling or sync status should be refreshed.
- Preserve existing Tauri command response shapes.
- Expose affected-row metadata internally for `run_sql` so event emission can avoid false positives.
- Convert the inventory example to React Query so users see the recommended cache invalidation pattern.
- Keep inventory table components presentational; Drizzle and React Query belong in hooks.
- Follow TDD during implementation by writing failing tests before production code for Rust event emission and React Query invalidation.

**Non-Goals:**
- Do not introduce live query subscriptions at the SQLite layer.
- Do not change the public `run_sql` Tauri response shape.
- Do not make React Query a dependency of the core `baresync` package.
- Do not require consumers to use React Query; it is only the inventory example's teaching surface.
- Do not guarantee table-level precision for every event payload in the first version.

## Decisions

### Use two event types

The plugin will emit `baresync://data-changed` for cache invalidation and `baresync://sync-status-changed` for polling/sync status UI. Combining both into one event would force table queries to refetch for status-only changes such as pause, resume, or no-op sync completion.

### Emit data changes only from observable mutations

The data-change event should fire when local SQLite rows or sync metadata that the frontend can read changed. The implementation can infer this from existing result types:
- `run_sql` emits only when `method == "run"` and internal `rows_affected > 0`.
- `run_sql_batch` emits only when `BatchResult.rows_affected > 0`.
- `pull` emits when `PullResult.rows_received > 0`.
- `push` emits when `PushResult.tables_synced` is non-empty.
- `sync_now` and `sync_full_resync` inspect their nested pull and push results.

This avoids noisy invalidation for no-op sync cycles while still updating UI after real local changes.

### Preserve command return shapes with internal metadata

`baresync-core` should gain an internal SQL execution helper that returns rows plus affected-row metadata. The existing `run_sql` API can continue returning rows by projecting that internal result. The plugin command path can call the metadata helper and still return the old row list to JS.

### Use an event sink abstraction for tests

The plugin should not make host tests construct a real Tauri app just to assert emitted events. `PluginState` should hold an event sink abstraction that the Tauri builder backs with `AppHandle.emit(...)` and host tests back with an in-memory recorder.

### Move polling loop output from unit to sync outcome

The polling loop currently receives a sync closure returning `Result<(), String>`, which loses information about whether data changed. The closure should return a small sync outcome value that records data-change and status-change signals. The loop can still own timer/debounce behavior while event emission stays near command state.

### React Query owns inventory app refresh

The inventory app should install `@tanstack/react-query`, create a `QueryClientProvider`, and use Tauri `listen(...)` to invalidate query keys:
- `baresync://data-changed` invalidates `["inventory"]` and sync state.
- `baresync://sync-status-changed` invalidates sync state.

Inventory data hooks should own Drizzle queries and React Query keys. `DataTable` should receive rows, loading/error state, columns, and command callbacks without accepting query builders.

## Risks / Trade-offs

- [Risk] SQLite `rows_affected` can count rows matched by a statement even if values are unchanged in some cases. -> Mitigation: still better than emitting on every successful write command, and no public API shape depends on exact affected-row semantics.
- [Risk] Events can be missed while a frontend listener is not mounted. -> Mitigation: events trigger refetches but are not the source of truth; React Query reads through commands and the sync panel can refetch on mount.
- [Risk] Event payload table names may be incomplete for broad sync operations. -> Mitigation: query invalidation can use broad `["inventory"]` keys initially; table-level precision can be improved later.
- [Risk] Adding an event sink abstraction could overcomplicate the plugin. -> Mitigation: keep the abstraction small: one method that accepts a typed event and returns no result beyond best-effort logging/ignore.
