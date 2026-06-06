## ADDED Requirements

### Requirement: Runtime request header method

The JS sync client SHALL expose a `setHeaders(headers)` method that replaces the custom HTTP headers used by the Baresync Tauri plugin for sync requests.

#### Scenario: setHeaders invocation

- **WHEN** `client.setHeaders({ Authorization: "Bearer token-1" })` is called
- **THEN** the client SHALL call `invoke("plugin:baresync|set_headers", { headers: { Authorization: "Bearer token-1" } })`
- **AND** the method SHALL resolve or reject with the command result without hiding errors

#### Scenario: Clearing request headers

- **WHEN** `client.setHeaders({})` is called
- **THEN** the client SHALL call `invoke("plugin:baresync|set_headers", { headers: {} })`
- **AND** the plugin SHALL be instructed to clear all custom sync request headers

#### Scenario: Token refresh updates request headers

- **WHEN** `client.setHeaders({ Authorization: "Bearer old-token" })` has already resolved
- **AND** `client.setHeaders({ Authorization: "Bearer new-token" })` is called later
- **THEN** the client SHALL send the full replacement header set in the second invocation
- **AND** callers SHALL NOT be required to recreate the sync client to update credentials

### Requirement: Runtime request header command override

The JS sync client SHALL allow consumers to override the command name used by `setHeaders` through `SyncClientCommands`.

#### Scenario: setHeaders uses custom command name

- **WHEN** `createSyncClient` is called with `commands: { setHeaders: "set_sync_headers" }`
- **AND** `client.setHeaders({ "X-Api-Key": "key-1" })` is called
- **THEN** the client SHALL call `invoke("set_sync_headers", { headers: { "X-Api-Key": "key-1" } })`

#### Scenario: setHeaders participates in mocked invoke tests

- **WHEN** a test creates a sync client with a custom `invoke` function
- **AND** the test calls `client.setHeaders({ Authorization: "Bearer test" })`
- **THEN** the injected `invoke` function SHALL receive the same command name and argument shape used by production code

## MODIFIED Requirements

### Requirement: createSyncClient factory

The JS package SHALL export a `createSyncClient` function that accepts `{ scopeId, commands?, invoke? }` and returns a sync client object with methods `syncNow`, `push`, `pull`, `fullResync`, `getState`, and `setHeaders`.

#### Scenario: Create sync client with required options

- **WHEN** `createSyncClient({ scopeId: "outlet-1" })` is called
- **THEN** a client object SHALL be returned with `syncNow`, `push`, `pull`, `fullResync`, `getState`, and `setHeaders` methods

#### Scenario: Create sync client with custom invoke

- **WHEN** `createSyncClient` is called with a custom `invoke` function
- **THEN** the client SHALL use the provided `invoke` for all Tauri command calls, including `setHeaders`

#### Scenario: Create sync client with custom command names

- **WHEN** `createSyncClient` is called with custom command names
- **THEN** the client SHALL invoke those configured command names instead of the plugin namespace defaults

### Requirement: Consumer integration contract

The JS sync client SHALL expose and document the command argument shape that consumer apps must preserve when integrating with the Tauri plugin.

#### Scenario: Command shape documented

- **WHEN** a consumer reads JS sync client integration guidance
- **THEN** it SHALL state the command names and argument shape used by `syncNow`, `push`, `pull`, `fullResync`, `getState`, and `setHeaders`

#### Scenario: Custom invoke remains supported

- **WHEN** a private app wraps or instruments Tauri invocation
- **THEN** the JS sync client SHALL continue to support a custom `invoke` function for testing, logging, error mapping, or app-specific shell integration

#### Scenario: Auth header lifecycle documented

- **WHEN** a consumer reads JS sync client integration guidance for authenticated sync
- **THEN** it SHALL explain that the app obtains session credentials and calls `setHeaders` to propagate them to plugin-owned sync HTTP requests
- **AND** it SHALL explain that token refresh requires another `setHeaders` call rather than recreating the client

### Requirement: Consumer error propagation

The JS sync client SHALL preserve plugin command failures in a form that consumer apps can classify and display.

#### Scenario: Plugin error reaches consumer

- **WHEN** a sync client method receives a rejected command invocation
- **THEN** the method SHALL reject without hiding the original error message or structured error value

#### Scenario: Integration docs describe error boundary

- **WHEN** a consumer reads integration guidance
- **THEN** it SHALL explain that app UI state, retry policy, toast messages, token refresh, and auth-expiry handling remain consumer responsibilities around the JS sync client

#### Scenario: setHeaders validation errors reach consumer

- **WHEN** `client.setHeaders(headers)` receives a rejected command invocation because the plugin rejected invalid headers
- **THEN** the method SHALL reject without converting the error into a generic sync failure

### Requirement: Polling methods in SyncClient interface

The `SyncClient` interface SHALL include `startPolling`, `stopPolling`, `pausePolling`, `resumePolling`, `getPollingStatus`, and `setHeaders`.

#### Scenario: Interface includes polling and header methods

- **WHEN** `createSyncClient` returns a client object
- **THEN** the object SHALL have `startPolling`, `stopPolling`, `pausePolling`, `resumePolling`, `getPollingStatus`, and `setHeaders` methods alongside existing `syncNow`, `push`, `pull`, `fullResync`, `getState`

#### Scenario: Authenticated polling can be initialized in order

- **WHEN** a consumer creates a client for protected sync routes
- **AND** calls `client.setHeaders({ Authorization: "Bearer token" })`
- **AND** then calls `client.startPolling()`
- **THEN** the JS API SHALL support that ordering without requiring a new client instance
