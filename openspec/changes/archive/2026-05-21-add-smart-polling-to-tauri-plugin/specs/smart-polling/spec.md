## ADDED Requirements

### Requirement: Background sync loop
The plugin SHALL run an optional background tokio task that periodically calls `sync_now` for a given `scope_id`.

#### Scenario: Start polling
- **WHEN** the JS client calls `invoke("start_polling", { scopeId: "outlet-1" })`
- **THEN** the plugin SHALL spawn a background task that calls `sync_now` every `poll_interval_secs`

#### Scenario: Start polling is idempotent
- **WHEN** `start_polling` is called while polling is already running for the same scope
- **THEN** the plugin SHALL NOT spawn a duplicate task

#### Scenario: Stop polling
- **WHEN** the JS client calls `invoke("stop_polling")`
- **THEN** the plugin SHALL terminate the background task

#### Scenario: Stop polling when not running
- **WHEN** `stop_polling` is called while no polling task is active
- **THEN** the command SHALL return success without error

### Requirement: Write-triggered push
After `run_sql` or `run_sql_batch` executes, the plugin SHALL notify the background task to perform an immediate push.

#### Scenario: Write triggers immediate push
- **WHEN** the frontend calls `invoke("run_sql", { query: ... })` while polling is active
- **THEN** the plugin SHALL execute the SQL, then signal the background task to push

#### Scenario: Write-triggered push resets poll timer
- **WHEN** a write-triggered push completes
- **THEN** the next timer-based sync SHALL be delayed by a full `poll_interval_secs` from the push completion time

#### Scenario: Write notification when polling is not active
- **WHEN** `run_sql` or `run_sql_batch` is called but polling has not been started
- **THEN** the SQL SHALL execute normally and the notification SHALL be silently ignored

### Requirement: Debounce on any sync activity
Every sync execution — whether triggered by the timer, a write event, or a manual command — SHALL reset the poll timer.

#### Scenario: Manual sync_now resets poll timer
- **WHEN** the frontend calls `invoke("sync_now", { scopeId: ... })` while polling is active
- **THEN** the next automatic poll SHALL be scheduled for `poll_interval_secs` seconds after the manual sync completes

#### Scenario: Manual sync_push resets poll timer
- **WHEN** the frontend calls `invoke("sync_push", { scopeId: ... })` while polling is active
- **THEN** the next automatic poll SHALL be rescheduled from the push completion time

#### Scenario: Manual sync_pull resets poll timer
- **WHEN** the frontend calls `invoke("sync_pull", { scopeId: ... })` while polling is active
- **THEN** the next automatic poll SHALL be rescheduled from the pull completion time

### Requirement: Pause and resume polling
The plugin SHALL support pausing and resuming the background task without destroying it.

#### Scenario: Pause polling
- **WHEN** the frontend calls `invoke("pause_polling")` while polling is active
- **THEN** the background task SHALL stop executing syncs but remain alive

#### Scenario: Resume polling
- **WHEN** the frontend calls `invoke("resume_polling")` after pausing
- **THEN** the background task SHALL resume executing syncs and reset the poll timer

#### Scenario: Resume resets poll timer
- **WHEN** polling is resumed after a pause
- **THEN** the next sync SHALL be scheduled for `poll_interval_secs` seconds from the resume time

### Requirement: Background behavior defaults to off
By default, polling SHALL pause when the app is backgrounded and resume when it returns to the foreground. The plugin SHALL handle this lifecycle behavior in Rust when `poll_on_background` is `false`.

#### Scenario: Default poll_on_background is false
- **WHEN** the plugin is built without setting `poll_on_background`
- **THEN** `poll_on_background` SHALL default to `false`

#### Scenario: Plugin manages background pause
- **WHEN** the app goes to background and `poll_on_background` is `false`
- **THEN** the plugin SHALL pause the polling loop automatically
- **AND** the plugin SHALL resume the polling loop automatically when the app returns to foreground

#### Scenario: poll_on_background set to true
- **WHEN** the plugin is built with `poll_on_background(true)`
- **THEN** the background task SHALL continue polling regardless of app foreground/background state
- **AND** the frontend is NOT required to manage pause/resume for background transitions

### Requirement: Polling status query
The plugin SHALL expose a command to query the current polling state.

#### Scenario: Get polling status while active
- **WHEN** the frontend calls `invoke("get_polling_status")` while polling is running
- **THEN** the plugin SHALL return `{ running: true, paused: false, last_sync_at: "<ISO timestamp>" }`

#### Scenario: Get polling status while paused
- **WHEN** the frontend calls `invoke("get_polling_status")` while polling is paused
- **THEN** the plugin SHALL return `{ running: true, paused: true, last_sync_at: "<ISO timestamp>" }`

#### Scenario: Get polling status when not started
- **WHEN** the frontend calls `invoke("get_polling_status")` when no polling task has been started
- **THEN** the plugin SHALL return `{ running: false, paused: false, last_sync_at: null }`

### Requirement: Concurrency guard
The plugin SHALL prevent overlapping sync operations within the polling task.

#### Scenario: Timer fires during ongoing sync
- **WHEN** the poll timer fires while a sync is already in progress
- **THEN** the plugin SHALL skip the sync attempt and reset the timer for the next interval

#### Scenario: Write notification during ongoing sync
- **WHEN** a write notification arrives while a sync is already in progress
- **THEN** the plugin SHALL skip the immediate push and reset the timer for the next interval

### Requirement: Polling config
The plugin builder SHALL accept polling-related configuration.

#### Scenario: Configure poll interval
- **WHEN** `Builder::new().poll_interval_secs(60).build()` is called
- **THEN** the polling loop SHALL use 60 seconds as the interval

#### Scenario: Default poll interval
- **WHEN** the builder is used without setting `poll_interval_secs`
- **THEN** the default interval SHALL be 30 seconds
