## MODIFIED Requirements

### Requirement: Builder accepts migrations directory

The `Builder` SHALL accept a `migrations_dir` method that configures the path to SQL migration files for embedding.

#### Scenario: Builder with migrations
- **WHEN** `Builder::new().api_base_url("...").migrations_dir("./drizzle").build()` is called
- **THEN** the plugin SHALL embed and register the migrations from the specified directory

#### Scenario: Builder with polling config
- **WHEN** `Builder::new().poll_interval_secs(60).poll_on_background(false).build()` is called
- **THEN** the plugin SHALL store the polling configuration for use by the polling task

#### Scenario: Builder defaults for polling
- **WHEN** the builder is used without polling methods
- **THEN** `poll_interval_secs` SHALL default to 30 and `poll_on_background` SHALL default to `false`

## ADDED Requirements

### Requirement: Polling control commands
The plugin SHALL expose `start_polling`, `stop_polling`, `pause_polling`, `resume_polling`, and `get_polling_status` Tauri commands.

#### Scenario: start_polling command
- **WHEN** the JS client calls `invoke("start_polling", { scopeId: "outlet-1" })`
- **THEN** the plugin SHALL start the background polling task for the given scope

#### Scenario: stop_polling command
- **WHEN** the JS client calls `invoke("stop_polling")`
- **THEN** the plugin SHALL stop the background polling task

#### Scenario: pause_polling command
- **WHEN** the JS client calls `invoke("pause_polling")`
- **THEN** the plugin SHALL pause the polling task without destroying it

#### Scenario: resume_polling command
- **WHEN** the JS client calls `invoke("resume_polling")`
- **THEN** the plugin SHALL resume a paused polling task

#### Scenario: get_polling_status command
- **WHEN** the JS client calls `invoke("get_polling_status")`
- **THEN** the plugin SHALL return the current polling state

### Requirement: Write notification on SQL execution
The `run_sql` and `run_sql_batch` commands SHALL notify the polling task after execution.

#### Scenario: run_sql notifies polling
- **WHEN** `invoke("run_sql", { query: ... })` completes successfully
- **THEN** the plugin SHALL signal the polling task to consider an immediate push

#### Scenario: run_sql_batch notifies polling
- **WHEN** `invoke("run_sql_batch", { statements: ... })` completes successfully
- **THEN** the plugin SHALL signal the polling task to consider an immediate push
