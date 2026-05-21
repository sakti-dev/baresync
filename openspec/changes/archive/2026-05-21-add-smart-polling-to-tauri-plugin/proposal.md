## Why

The Tauri plugin only exposes one-shot sync commands (`sync_now`, `sync_push`, `sync_pull`). The frontend must manually call these on every mutation or rely on the user to trigger sync. This is error-prone — data goes stale if the consumer forgets to sync, and there's no mechanism to pull remote changes periodically. A smart polling system would keep data fresh automatically while being battery-conscious for mobile use cases like POS apps.

## What Changes

- Add a Rust-side background `tokio` task that runs a periodic sync loop inside the plugin
- The loop uses `tokio::select!` to handle three triggers: timer-based pull, write-event-triggered push (after `run_sql`/`run_sql_batch`), and pause/resume control signals
- Every sync execution resets the poll timer (debounce), so manual `sync_now` calls from JS delay the next automatic poll
- Add new Tauri commands: `start_polling`, `stop_polling`, `pause_polling`, `resume_polling`, `get_polling_status`
- `run_sql` and `run_sql_batch` notify the background task after executing SQL, triggering an immediate push
- Add `poll_interval_secs`, `poll_on_background`, and `scope_id` to plugin config
- Concurrency guard prevents overlapping syncs
- Update JS sync client with `startPolling`, `stopPolling`, `pausePolling`, `resumePolling` methods

## Capabilities

### New Capabilities
- `smart-polling`: Background sync loop with timer-based pull, write-triggered push, debounce on any sync activity, pause/resume control, and configurable background behavior

### Modified Capabilities
- `tauri-plugin-builder`: Add polling config fields (`poll_interval_secs`, `poll_on_background`) and new polling commands to the plugin surface
- `js-sync-client`: Add polling control methods (`startPolling`, `stopPolling`, `pausePolling`, `resumePolling`) to the client interface

## Impact

- `crates/tauri-plugin-baresync/src/`: New `polling.rs` module, modified `commands.rs`, `builder.rs`, `config.rs`, `lib.rs`
- `packages/baresync/src/tauri/client.ts`: New polling methods on `SyncClient`
- `packages/baresync/src/tauri/__test__/client.test.ts`: Tests for new polling methods
- No changes to `baresync-core` crate — all orchestration is in the plugin layer
- No breaking changes to existing commands or client methods
