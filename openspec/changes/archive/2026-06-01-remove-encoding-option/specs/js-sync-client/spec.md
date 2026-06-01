## MODIFIED Requirements

### Requirement: createSyncClient factory

The JS package SHALL export a `createSyncClient` function that accepts `{ scopeId, commands?, invoke? }` and returns a sync client object with methods `syncNow`, `push`, `pull`, `fullResync`, `getState`.

#### Scenario: Create sync client with required options

- **WHEN** `createSyncClient({ scopeId: "outlet-1" })` is called
- **THEN** a client object SHALL be returned with `syncNow`, `push`, `pull`, `fullResync`, and `getState` methods

#### Scenario: Create sync client with custom invoke

- **WHEN** `createSyncClient` is called with a custom `invoke` function
- **THEN** the client SHALL use the provided `invoke` for all Tauri command calls (testability)

#### Scenario: Create sync client with custom command names

- **WHEN** `createSyncClient` is called with custom command names
- **THEN** the client SHALL invoke those configured command names instead of the plugin namespace defaults

## REMOVED Requirements

### Requirement: Encoding option in sync client
**Reason**: The framework has committed to JSON as the only supported wire format. The encoding option in `createSyncClient` was a pass-through with no functional effect (the value was always `"json"`).
**Migration**: Remove the `encoding: "json"` field from any `createSyncClient` call. The client always uses JSON.
