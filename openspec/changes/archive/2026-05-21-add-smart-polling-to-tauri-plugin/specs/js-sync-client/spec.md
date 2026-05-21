## ADDED Requirements

### Requirement: Polling control methods
The JS sync client SHALL expose `startPolling`, `stopPolling`, `pausePolling`, and `resumePolling` methods.

#### Scenario: startPolling invocation
- **WHEN** `client.startPolling()` is called
- **THEN** the client SHALL call `invoke("start_polling", { scopeId: client.scopeId })`

#### Scenario: stopPolling invocation
- **WHEN** `client.stopPolling()` is called
- **THEN** the client SHALL call `invoke("stop_polling")`

#### Scenario: pausePolling invocation
- **WHEN** `client.pausePolling()` is called
- **THEN** the client SHALL call `invoke("pause_polling")`

#### Scenario: resumePolling invocation
- **WHEN** `client.resumePolling()` is called
- **THEN** the client SHALL call `invoke("resume_polling")`

### Requirement: Polling status method
The JS sync client SHALL expose a `getPollingStatus` method.

#### Scenario: getPollingStatus invocation
- **WHEN** `client.getPollingStatus()` is called
- **THEN** the client SHALL call `invoke("get_polling_status")` and return `{ running, paused, last_sync_at }`

### Requirement: Polling methods in SyncClient interface
The `SyncClient` interface SHALL include `startPolling`, `stopPolling`, `pausePolling`, `resumePolling`, and `getPollingStatus`.

#### Scenario: Interface includes polling methods
- **WHEN** `createSyncClient` returns a client object
- **THEN** the object SHALL have `startPolling`, `stopPolling`, `pausePolling`, `resumePolling`, and `getPollingStatus` methods alongside existing `syncNow`, `push`, `pull`, `fullResync`, `getState`
