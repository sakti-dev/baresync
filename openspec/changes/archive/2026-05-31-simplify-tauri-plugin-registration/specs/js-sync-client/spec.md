## ADDED Requirements

### Requirement: Plugin command namespace defaults

The JS sync client SHALL use Baresync plugin command names by default while preserving custom invocation and command-name overrides.

#### Scenario: Default sync command names use plugin namespace

- **WHEN** a sync client method invokes a Tauri command without custom command-name overrides
- **THEN** the command name SHALL use the Baresync plugin command namespace

#### Scenario: Legacy command names remain configurable

- **WHEN** a consumer configures custom command names for a sync client
- **THEN** the client SHALL invoke those configured command names instead of plugin namespace defaults

## MODIFIED Requirements

### Requirement: syncNow method
The client's `syncNow` method SHALL invoke the Baresync sync-now Tauri command with the configured `scopeId`.

#### Scenario: syncNow invocation
- **WHEN** `client.syncNow()` is called with default command configuration
- **THEN** the client SHALL call `invoke("plugin:baresync|sync_now", { scopeId: client.scopeId })` and return the result

#### Scenario: syncNow API remains stable when runtime becomes status-aware
- **WHEN** the runtime implementation adds status-aware orchestration
- **THEN** existing consumers SHALL continue to call `client.syncNow()` with the same argument shape
- **AND** no new JS orchestration method SHALL be required for cheap no-op sync behavior

### Requirement: push method
The client's `push` method SHALL invoke the Baresync push Tauri command.

#### Scenario: push invocation
- **WHEN** `client.push()` is called with default command configuration
- **THEN** the client SHALL call `invoke("plugin:baresync|sync_push", { scopeId: client.scopeId })` and return the result

### Requirement: pull method
The client's `pull` method SHALL invoke the Baresync pull Tauri command.

#### Scenario: pull invocation
- **WHEN** `client.pull()` is called with default command configuration
- **THEN** the client SHALL call `invoke("plugin:baresync|sync_pull", { scopeId: client.scopeId })` and return the result

### Requirement: fullResync method
The client's `fullResync` method SHALL invoke the Baresync full-resync Tauri command.

#### Scenario: fullResync invocation
- **WHEN** `client.fullResync()` is called with default command configuration
- **THEN** the client SHALL call `invoke("plugin:baresync|sync_full_resync", { scopeId: client.scopeId })` and return the result

### Requirement: getState method
The client's `getState` method SHALL invoke the Baresync local-state Tauri command.

#### Scenario: getState invocation
- **WHEN** `client.getState()` is called with default command configuration
- **THEN** the client SHALL call `invoke("plugin:baresync|get_sync_local_state", { scopeId: client.scopeId })` and return `LocalSyncState`

### Requirement: Consumer integration contract
The JS sync client SHALL expose and document the command argument shape that consumer apps must preserve when integrating with the Tauri plugin.

#### Scenario: Command shape documented
- **WHEN** a consumer reads JS sync client integration guidance
- **THEN** it SHALL state the plugin command names and argument shape used by `syncNow`, `push`, `pull`, `fullResync`, `getState`, and polling methods

#### Scenario: Custom invoke remains supported
- **WHEN** a private app wraps or instruments Tauri invocation
- **THEN** the JS sync client SHALL continue to support a custom `invoke` function for testing, logging, error mapping, or app-specific shell integration

### Requirement: Polling control methods
The JS sync client SHALL expose `startPolling`, `stopPolling`, `pausePolling`, `resumePolling`, and `getPollingStatus` methods.

#### Scenario: startPolling invocation
- **WHEN** `client.startPolling()` is called with default command configuration
- **THEN** the client SHALL call `invoke("plugin:baresync|start_polling", { scopeId: client.scopeId })`

#### Scenario: stopPolling invocation
- **WHEN** `client.stopPolling()` is called with default command configuration
- **THEN** the client SHALL call `invoke("plugin:baresync|stop_polling")`

#### Scenario: pausePolling invocation
- **WHEN** `client.pausePolling()` is called with default command configuration
- **THEN** the client SHALL call `invoke("plugin:baresync|pause_polling")`

#### Scenario: resumePolling invocation
- **WHEN** `client.resumePolling()` is called with default command configuration
- **THEN** the client SHALL call `invoke("plugin:baresync|resume_polling")`

### Requirement: Polling status method
The JS sync client SHALL expose a `getPollingStatus` method.

#### Scenario: getPollingStatus invocation
- **WHEN** `client.getPollingStatus()` is called with default command configuration
- **THEN** the client SHALL call `invoke("plugin:baresync|get_polling_status")` and return `{ running, paused, last_sync_at }`
