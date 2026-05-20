## MODIFIED Requirements

### Requirement: syncNow method
The client's `syncNow` method SHALL invoke the `sync_now` Tauri command with the configured `scopeId`. Status-aware orchestration SHALL remain behind the Tauri command boundary; the JS client SHALL NOT require consumers to call a separate status method before `syncNow`.

#### Scenario: syncNow invocation
- **WHEN** `client.syncNow()` is called
- **THEN** the client SHALL call `invoke("sync_now", { scopeId: client.scopeId })` and return the result

#### Scenario: syncNow API remains stable when runtime becomes status-aware
- **WHEN** the runtime implementation adds status-aware orchestration
- **THEN** existing consumers SHALL continue to call `client.syncNow()` with the same argument shape
- **AND** no new JS orchestration method SHALL be required for cheap no-op sync behavior
