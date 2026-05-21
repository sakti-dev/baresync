## 1. Config and State Extensions

- [x] 1.1 Add `poll_interval_secs: u64` and `poll_on_background: bool` fields to `PluginConfig` in `config.rs` (defaults: 30, false)
- [x] 1.2 Add `poll_interval_secs()` and `poll_on_background()` builder methods to `Builder` in `builder.rs`
- [x] 1.3 Add polling-related fields to `PluginState`: `Arc<Notify>`, `Arc<AtomicBool>` (sync-in-progress flag), `mpsc::Sender<ControlMsg>`, `Option<JoinHandle<()>>`, `Arc<Mutex<PollingState>>`
- [x] 1.4 Add `tokio` dependency with `sync` and `time` features to `Cargo.toml`

## 2. Polling Task Module

- [x] 2.1 Create `polling.rs` module with `ControlMsg` enum (`Pause`, `Resume`, `Stop`) and `PollingState` struct (`running`, `paused`, `last_sync_at`)
- [x] 2.2 Implement `polling_loop` async function with `tokio::select!` on timer (`sleep_until`), `Notify`, and `mpsc::Receiver<ControlMsg>`
- [x] 2.3 Implement debounce logic: after every sync execution, reset `next_tick = Instant::now() + interval`
- [x] 2.4 Implement concurrency guard using `AtomicBool` — skip sync if already in progress
- [x] 2.5 Implement write-triggered push path: on `Notify`, push then reset timer
- [x] 2.6 Implement timer-triggered path: call `sync_now` then reset timer
- [x] 2.7 Handle `ControlMsg::Pause` (set paused flag, skip syncs), `Resume` (clear paused, reset timer), `Stop` (break loop)
- [x] 2.8 Register module in `lib.rs`

## 3. Tauri Commands

- [x] 3.1 Add `start_polling` command: spawn the polling task if not already running, store `JoinHandle` in state
- [x] 3.2 Add `stop_polling` command: send `Stop` via control channel, await `JoinHandle`, clear state
- [x] 3.3 Add `pause_polling` command: send `Pause` via control channel
- [x] 3.4 Add `resume_polling` command: send `Resume` via control channel
- [x] 3.5 Add `get_polling_status` command: read `PollingState` and return JSON `{ running, paused, last_sync_at }`
- [x] 3.6 Modify `run_sql` and `run_sql_batch` to call `notify.notify_one()` on the `PluginState`'s `Notify` after execution

## 4. Builder Integration

- [x] 4.1 Wire polling config from `PluginConfig` into `PluginState` fields during `Builder::build` setup
- [x] 4.2 Initialize `Notify`, `AtomicBool`, `PollingState` in builder setup
- [x] 4.3 Wire app lifecycle events into builder setup so `poll_on_background` automatically pauses and resumes polling in Rust

## 5. JS Client Updates

- [x] 5.1 Add `startPolling`, `stopPolling`, `pausePolling`, `resumePolling`, `getPollingStatus` methods to `SyncClient` interface
- [x] 5.2 Implement the methods in `createSyncClient` return object, each calling the corresponding Tauri command

## 6. Tests

- [x] 6.1 Add unit tests in `polling.rs` for the loop logic (timer reset, concurrency guard, pause/resume) using a mock sync function
- [x] 6.2 Add command signature test for new commands in `commands.rs` test module
- [x] 6.3 Add JS client tests for new polling methods in `packages/baresync/src/tauri/__test__/client.test.ts`
- [x] 6.4 Add coverage for automatic background pause/resume behavior when `poll_on_background` is `false`

## 7. Lint and Verify

- [x] 7.1 Run `bun x ultracite check` and fix any issues
- [x] 7.2 Run `cargo check -p tauri-plugin-baresync` and fix any issues
- [x] 7.3 Run `cargo test -p tauri-plugin-baresync` and ensure all tests pass
- [x] 7.4 Run `bun test` in `packages/baresync` and ensure JS client tests pass
