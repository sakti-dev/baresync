## ADDED Requirements

### Requirement: createSyncClient factory
The JS package SHALL export a `createSyncClient` function that accepts `{ apiUrl, encoding, scopeId, invoke? }` and returns a sync client object with methods `syncNow`, `push`, `pull`, `fullResync`, `getState`.

#### Scenario: Create sync client with required options
- **WHEN** `createSyncClient({ apiUrl: "https://api.example.com", encoding: "json", scopeId: "outlet-1" })` is called
- **THEN** a client object SHALL be returned with `syncNow`, `push`, `pull`, `fullResync`, and `getState` methods

#### Scenario: Create sync client with custom invoke
- **WHEN** `createSyncClient` is called with a custom `invoke` function
- **THEN** the client SHALL use the provided `invoke` for all Tauri command calls (testability)

### Requirement: syncNow method
The client's `syncNow` method SHALL invoke the `sync_now` Tauri command with the configured `scopeId`.

#### Scenario: syncNow invocation
- **WHEN** `client.syncNow()` is called
- **THEN** the client SHALL call `invoke("sync_now", { scopeId: client.scopeId })` and return the result

### Requirement: push method
The client's `push` method SHALL invoke the `sync_push` Tauri command.

#### Scenario: push invocation
- **WHEN** `client.push()` is called
- **THEN** the client SHALL call `invoke("sync_push", { scopeId: client.scopeId })` and return the result

### Requirement: pull method
The client's `pull` method SHALL invoke the `sync_pull` Tauri command.

#### Scenario: pull invocation
- **WHEN** `client.pull()` is called
- **THEN** the client SHALL call `invoke("sync_pull", { scopeId: client.scopeId })` and return the result

### Requirement: fullResync method
The client's `fullResync` method SHALL invoke the `sync_full_resync` Tauri command.

#### Scenario: fullResync invocation
- **WHEN** `client.fullResync()` is called
- **THEN** the client SHALL call `invoke("sync_full_resync", { scopeId: client.scopeId })` and return the result

### Requirement: getState method
The client's `getState` method SHALL invoke the `get_sync_local_state` Tauri command.

#### Scenario: getState invocation
- **WHEN** `client.getState()` is called
- **THEN** the client SHALL call `invoke("get_sync_local_state", { scopeId: client.scopeId })` and return `LocalSyncState`

### Requirement: Browser-test-safe behavior
The JS client SHALL work in browser/test environments where Tauri IPC is unavailable. When no `invoke` is provided and `window.__TAURI_INTERNALS__` is absent, the client SHALL throw a descriptive error at call time, not at import time.

#### Scenario: Client imports without Tauri runtime
- **WHEN** the module is imported in a test environment without Tauri
- **THEN** the import SHALL succeed; errors SHALL occur only when methods are called

#### Scenario: Client method call without Tauri runtime and no custom invoke
- **WHEN** `client.syncNow()` is called in an environment without Tauri and no custom invoke was provided
- **THEN** a descriptive error SHALL be thrown explaining that Tauri IPC is unavailable
