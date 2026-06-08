## MODIFIED Requirements

### Requirement: sync_now orchestration
The `SyncEngine` SHALL expose a `sync_now` method that executes a status-aware sync cycle. It SHALL read local sync state, request server status with the stored cursor, choose the minimal transfer mode, preserve server-wins reconciliation behavior, run garbage collection when transfer work occurs, and return a `SyncNowResult` containing pull result, push result, purged count, and enough mode/result data for callers to distinguish skipped work from transfer work.

The runtime SHALL choose:
1. Full resync when `needs_baseline_sync` is true
2. Skip transfer work when there are no local dirty rows and server status reports no changes
3. Push only when local dirty rows exist and server status reports no changes
4. Pull only when no local dirty rows exist and server status reports changes
5. Pull then push when both local dirty rows and server status changes exist
6. A follow-up baseline pull for rejected tables when push reports server-wins rejected rows

When `needs_baseline_sync` is true, the full resync SHALL pull all contract tables and SHALL NOT filter the baseline pull by status `changedTables`.

#### Scenario: Full sync with no conflicts
- **WHEN** `sync_now` is called and there are local outbox changes and server status reports changed tables
- **THEN** the engine SHALL pull only the changed server tables, then push all outbox changes, then run garbage collection, and return combined results

#### Scenario: Full sync with server-wins rejections
- **WHEN** `sync_now` is called and the push response contains rejected rows with reason "server_newer"
- **THEN** the engine SHALL perform a follow-up pull from baseline (empty cursor) scoped to only the rejected tables, apply the server's versions, and NOT advance the main cursor for this reconciliation pull

#### Scenario: Full sync with no local changes
- **WHEN** `sync_now` is called, the outbox is empty, and server status reports changes
- **THEN** the engine SHALL skip push, pull only the changed server tables, and run garbage collection

#### Scenario: Full sync with no server changes
- **WHEN** `sync_now` is called, the outbox has local changes, and server status reports no changes
- **THEN** the engine SHALL skip pull, push local changes, and run garbage collection

#### Scenario: Full sync with no local or server changes
- **WHEN** `sync_now` is called, the outbox is empty, and server status reports no changes
- **THEN** the engine SHALL skip pull, skip push, skip garbage collection, and return a no-op result

#### Scenario: Baseline sync ignores status skip
- **WHEN** `sync_now` is called and local state reports `needs_baseline_sync`
- **THEN** the engine SHALL perform baseline pull behavior instead of skipping transfer work, even if status reports no changes

#### Scenario: Initial baseline sync ignores changedTables filter
- **WHEN** `sync_now` is called, local state reports `needs_baseline_sync`, and server status reports `changedTables: ["categories"]`
- **THEN** the baseline pull request SHALL include all contract upsert tables
- **AND** the baseline pull request SHALL use an empty cursor string

#### Scenario: Incremental pull still uses changedTables filter
- **WHEN** `sync_now` is called, local state has a non-empty cursor, the outbox is empty, and server status reports `changedTables: ["categories"]`
- **THEN** the pull request SHALL include only `["categories"]`
- **AND** the pull request SHALL use the stored cursor

### Requirement: sync_full_resync
The `SyncEngine` SHALL expose a `sync_full_resync` method that performs a baseline pull (empty cursor) for all tables → push → garbage collection.

#### Scenario: Full resync from scratch
- **WHEN** `sync_full_resync` is called
- **THEN** the engine SHALL pull all data from baseline (empty cursor), push any local outbox changes, and run garbage collection

#### Scenario: Full resync sends all contract tables
- **WHEN** `sync_full_resync` performs the baseline pull
- **THEN** the pull request SHALL include all contract upsert tables
- **AND** the pull request SHALL NOT be filtered by status changed tables

### Requirement: get_sync_local_state
The `SyncEngine` SHALL expose a `get_sync_local_state` method that returns `LocalSyncState { local_dirty_count, last_server_watermark, needs_baseline_sync }`.

#### Scenario: Query local state with pending changes
- **WHEN** `get_sync_local_state` is called and the outbox has unsynced rows
- **THEN** `local_dirty_count` SHALL reflect the count of unsynced outbox rows

#### Scenario: Query local state with no cursor
- **WHEN** `get_sync_local_state` is called and no cursor exists in `sync_cursors`
- **THEN** `last_server_watermark` SHALL be empty and `needs_baseline_sync` SHALL be true

#### Scenario: Query local state with empty cursor
- **WHEN** `get_sync_local_state` is called and `sync_cursors` contains an empty `last_cursor` for the scope
- **THEN** `last_server_watermark` SHALL be empty and `needs_baseline_sync` SHALL be true

#### Scenario: Query local state with non-empty cursor
- **WHEN** `get_sync_local_state` is called and `sync_cursors` contains non-empty `last_cursor` for the scope
- **THEN** `last_server_watermark` SHALL equal that cursor and `needs_baseline_sync` SHALL be false
