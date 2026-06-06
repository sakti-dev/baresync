## Purpose

JavaScript client API for invoking Baresync Tauri plugin commands from app code.

## Requirements

### Requirement: Plugin command namespace defaults

The JS sync client SHALL use Baresync plugin command names by default while preserving custom invocation and command-name overrides.

#### Scenario: Default sync command names use plugin namespace

- **WHEN** a sync client method invokes a Tauri command without custom command-name overrides
- **THEN** the command name SHALL use the Baresync plugin command namespace

#### Scenario: Legacy command names remain configurable

- **WHEN** a consumer configures custom command names for a sync client
- **THEN** the client SHALL invoke those configured command names instead of plugin namespace defaults

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

### Requirement: syncNow method
The client's `syncNow` method SHALL invoke the Baresync sync-now Tauri command with the configured `scopeId`.

#### Scenario: syncNow invocation
- **WHEN** `client.syncNow()` is called
- **THEN** the client SHALL call `invoke("plugin:baresync|sync_now", { scopeId: client.scopeId })` and return the result

#### Scenario: syncNow API remains stable when runtime becomes status-aware
- **WHEN** the runtime implementation adds status-aware orchestration
- **THEN** existing consumers SHALL continue to call `client.syncNow()` with the same argument shape
- **AND** no new JS orchestration method SHALL be required for cheap no-op sync behavior

### Requirement: push method
The client's `push` method SHALL invoke the Baresync push Tauri command.

#### Scenario: push invocation
- **WHEN** `client.push()` is called
- **THEN** the client SHALL call `invoke("plugin:baresync|sync_push", { scopeId: client.scopeId })` and return the result

### Requirement: pull method
The client's `pull` method SHALL invoke the Baresync pull Tauri command.

#### Scenario: pull invocation
- **WHEN** `client.pull()` is called
- **THEN** the client SHALL call `invoke("plugin:baresync|sync_pull", { scopeId: client.scopeId })` and return the result

### Requirement: fullResync method
The client's `fullResync` method SHALL invoke the Baresync full-resync Tauri command.

#### Scenario: fullResync invocation
- **WHEN** `client.fullResync()` is called
- **THEN** the client SHALL call `invoke("plugin:baresync|sync_full_resync", { scopeId: client.scopeId })` and return the result

### Requirement: getState method
The client's `getState` method SHALL invoke the Baresync local-state Tauri command.

#### Scenario: getState invocation
- **WHEN** `client.getState()` is called
- **THEN** the client SHALL call `invoke("plugin:baresync|get_sync_local_state", { scopeId: client.scopeId })` and return `LocalSyncState`

### Requirement: Browser-test-safe behavior
The JS client SHALL work in browser/test environments where Tauri IPC is unavailable. When no `invoke` is provided and `window.__TAURI_INTERNALS__` is absent, the client SHALL throw a descriptive error at call time, not at import time.

#### Scenario: Client imports without Tauri runtime
- **WHEN** the module is imported in a test environment without Tauri
- **THEN** the import SHALL succeed; errors SHALL occur only when methods are called

#### Scenario: Client method call without Tauri runtime and no custom invoke
- **WHEN** `client.syncNow()` is called in an environment without Tauri and no custom invoke was provided
- **THEN** a descriptive error SHALL be thrown explaining that Tauri IPC is unavailable

### Requirement: Device-like invoke simulation
The JS sync client SHALL support device-like simulation through injected Tauri invocation without requiring a Tauri runtime at test time.

#### Scenario: Propagate mocked command results
- **WHEN** a sync client method calls an injected `invoke` function that resolves with a value
- **THEN** the method SHALL resolve with that value

#### Scenario: Propagate mocked command errors
- **WHEN** a sync client method calls an injected `invoke` function that rejects with an error
- **THEN** the method SHALL reject with that error

#### Scenario: Preserve command argument shape
- **WHEN** a sync client method is called in a JS simulation test
- **THEN** the injected `invoke` function SHALL receive the same command name and argument shape used by the Tauri plugin commands

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

### Requirement: Polling control methods
The JS sync client SHALL expose `startPolling`, `stopPolling`, `pausePolling`, `resumePolling`, and `getPollingStatus` methods.

#### Scenario: startPolling invocation
- **WHEN** `client.startPolling()` is called
- **THEN** the client SHALL call `invoke("plugin:baresync|start_polling", { scopeId: client.scopeId })`

#### Scenario: stopPolling invocation
- **WHEN** `client.stopPolling()` is called
- **THEN** the client SHALL call `invoke("plugin:baresync|stop_polling")`

#### Scenario: pausePolling invocation
- **WHEN** `client.pausePolling()` is called
- **THEN** the client SHALL call `invoke("plugin:baresync|pause_polling")`

#### Scenario: resumePolling invocation
- **WHEN** `client.resumePolling()` is called
- **THEN** the client SHALL call `invoke("plugin:baresync|resume_polling")`

### Requirement: Polling status method
The JS sync client SHALL expose a `getPollingStatus` method.

#### Scenario: getPollingStatus invocation
- **WHEN** `client.getPollingStatus()` is called
- **THEN** the client SHALL call `invoke("plugin:baresync|get_polling_status")` and return `{ running, paused, last_sync_at }`

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

### Requirement: Transaction-scoped local write API

The JS sync client SHALL expose `writeTransaction(db, callback)` that runs `callback` inside the provided Drizzle database transaction and returns the callback result.

#### Scenario: Transaction callback commits

- **WHEN** `client.writeTransaction(db, callback)` is called and `callback` resolves
- **THEN** the callback SHALL run with a Drizzle transaction object
- **AND** the transaction SHALL commit
- **AND** `writeTransaction` SHALL resolve with the callback result

#### Scenario: Transaction callback rolls back

- **WHEN** `client.writeTransaction(db, callback)` is called and `callback` rejects
- **THEN** the transaction SHALL roll back
- **AND** `writeTransaction` SHALL reject with the original error

### Requirement: Single-row local change helper

The JS sync client SHALL expose `writeLocalChange(tx, options)` for single-row local mutations. The helper SHALL run `options.write(tx)` and then enqueue exactly one outbox row for `options.table`, `options.rowId`, and `options.operation` in the same transaction.

#### Scenario: Single-row insert enqueues outbox

- **WHEN** `client.writeLocalChange(tx, { table, rowId, operation: "insert", write })` is called inside `writeTransaction`
- **THEN** the domain row mutation SHALL execute using the provided transaction
- **AND** exactly one pending `sync_outbox` row SHALL be inserted for the same table and row id

#### Scenario: Single-row soft delete uses update operation

- **WHEN** `client.writeLocalChange(tx, { table, rowId, operation: "update", write })` soft-deletes one local row by setting `deletedAt`
- **THEN** the outbox row SHALL use `operation: "update"`
- **AND** the helper SHALL NOT require consumers to pass `tableName`, `scopeId`, or `changedAt`

### Requirement: Explicit enqueue primitive

The JS sync client SHALL expose `enqueueChange(tx, options)` that inserts one pending `sync_outbox` row using the transaction provided by the caller.

#### Scenario: Enqueue derives sync bookkeeping

- **WHEN** `client.enqueueChange(tx, { table, rowId, operation })` is called
- **THEN** the client SHALL derive `tableName` from the Drizzle table
- **AND** the client SHALL use the configured `scopeId`
- **AND** the client SHALL generate `changedAt`
- **AND** the client SHALL generate the outbox id

#### Scenario: Bulk update enqueues one row per affected id

- **WHEN** a consumer updates multiple rows in one transaction
- **THEN** the consumer SHALL call `enqueueChange` once per affected row id inside the same `writeTransaction`
- **AND** the JS client SHALL support multiple `enqueueChange` calls in that transaction

### Requirement: Bulk mutation safety boundary

`writeLocalChange` SHALL be documented and typed as a single-row helper. It SHALL NOT claim to detect every row affected by arbitrary Drizzle update or delete predicates.

#### Scenario: Single-row helper does not infer bulk effects

- **WHEN** a caller passes a write callback that updates multiple rows
- **THEN** `writeLocalChange` SHALL still enqueue only the single `rowId` provided by the caller
- **AND** docs SHALL instruct consumers to use `enqueueChange` in a loop for bulk mutations

### Requirement: Local write helper operations

The JS local write helpers SHALL support `operation: "insert"` and `operation: "update"` for the documented common path.

#### Scenario: Common operations are accepted

- **WHEN** a consumer calls `writeLocalChange` or `enqueueChange` with `operation: "insert"` or `operation: "update"`
- **THEN** the helper SHALL enqueue the change without requiring hard-delete semantics

#### Scenario: Hard delete remains out of common path

- **WHEN** a consumer needs hard-delete tombstone behavior
- **THEN** that behavior SHALL remain outside the documented `writeLocalChange` common path for this change
