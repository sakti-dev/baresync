## 1. Rust TDD: DB Proxy Metadata And Events

- [x] 1.1 Add a failing `baresync-core` test proving `run_sql` metadata reports `rows_affected > 0` for write statements and `0` for reads or no-op writes.
- [x] 1.2 Implement the internal SQL execution metadata helper while preserving the existing public `run_sql` return shape.
- [x] 1.3 Add failing plugin command tests proving `run_sql` and `run_sql_batch` emit `baresync://data-changed` only when affected rows are greater than zero.
- [x] 1.4 Implement a host-testable plugin event sink and wire DB proxy command event emission through it.
- [x] 1.5 Re-run the targeted Rust tests and keep them green before moving to sync events.

## 2. Rust TDD: Sync And Polling Events

- [x] 2.1 Add failing plugin tests proving manual `sync_pull`, `sync_push`, `sync_now`, and `sync_full_resync` emit `baresync://data-changed` only when their results indicate local changes.
- [x] 2.2 Add failing plugin tests proving manual sync completion, polling pause, resume, and stop emit `baresync://sync-status-changed`.
- [x] 2.3 Update sync command helpers to inspect `PullResult`, `PushResult`, and `SyncNowResult` for data-change signals.
- [x] 2.4 Add failing polling loop tests proving polling emits data-change and status-change outcomes from timer and write-triggered sync paths.
- [x] 2.5 Update the polling loop sync closure result shape so polling can emit events without losing debounce or concurrency behavior.
- [x] 2.6 Wire the Tauri builder to emit plugin events through `AppHandle.emit(...)`.

## 3. Inventory React Query TDD

- [x] 3.1 Add React Query and any test dependencies needed by the inventory app.
- [x] 3.2 Add failing tests or focused component/hook checks proving plugin `data-changed` events invalidate inventory query keys.
- [x] 3.3 Add failing tests or focused component/hook checks proving plugin `sync-status-changed` events invalidate sync-state keys without invalidating inventory data keys.
- [x] 3.4 Add failing checks proving `DataTable` renders provided rows and does not own Drizzle query construction.
- [x] 3.5 Implement `QueryClientProvider` and a Baresync event bridge in the inventory app.
- [x] 3.6 Replace `useDrizzleQuery` interval polling with React Query inventory data hooks.
- [x] 3.7 Replace `useSyncState` interval polling with a React Query sync-state hook.
- [x] 3.8 Refactor `App.tsx` and `DataTable` so App passes rows, loading/error state, and columns instead of query builders.

## 4. Documentation And Specs

- [x] 4.1 Update inventory example README or inline docs to mention React Query invalidation from plugin events.
- [x] 4.2 Update relevant package dependencies and generated lock/install state if needed.
- [x] 4.3 Confirm the OpenSpec delta specs still match the final event names and React Query behavior.

## 5. Verification

- [x] 5.1 Run targeted Rust tests for `baresync-core` DB proxy metadata.
- [x] 5.2 Run `cargo test -p tauri-plugin-baresync`.
- [x] 5.3 Run targeted inventory app tests or checks for React Query event invalidation.
- [x] 5.4 Run `bun run check` from `examples/inventory-json-polling`.
- [x] 5.5 Run `bun x ultracite check`.
- [x] 5.6 Run `bun run typecheck`.
