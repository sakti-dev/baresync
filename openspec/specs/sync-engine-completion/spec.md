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

### Requirement: PullStartCursor enum
The pull module SHALL support a `PullStartCursor` enum with two variants: `Baseline` (empty cursor, pulls everything) and `Stored` (uses the cursor stored in `sync_cursors`). The `pull` function SHALL accept this enum.

#### Scenario: Pull with stored cursor
- **WHEN** pull is called with `PullStartCursor::Stored` and a cursor exists in `sync_cursors`
- **THEN** the pull request SHALL include the stored cursor value

#### Scenario: Pull with stored cursor when no cursor exists
- **WHEN** pull is called with `PullStartCursor::Stored` and no cursor exists
- **THEN** the pull request SHALL use an empty cursor string

#### Scenario: Pull from baseline
- **WHEN** pull is called with `PullStartCursor::Baseline`
- **THEN** the pull request SHALL use an empty cursor string regardless of stored cursor state

### Requirement: sync_full_resync
The `SyncEngine` SHALL expose a `sync_full_resync` method that performs a baseline pull (empty cursor) for all tables → push → garbage collection.

#### Scenario: Full resync from scratch
- **WHEN** `sync_full_resync` is called
- **THEN** the engine SHALL pull all data from baseline (empty cursor), push any local outbox changes, and run garbage collection

### Requirement: Garbage collection
The `SyncEngine` SHALL expose a `run_garbage_collection` method that deletes rows from sync tables where `deleted_at IS NOT NULL AND deleted_at != '' AND deleted_at != 'null' AND is_synced = 1`.

#### Scenario: Garbage collection purges soft-deleted synced rows
- **WHEN** garbage collection is called and a table has rows with `deleted_at` set and `is_synced = 1`
- **THEN** those rows SHALL be deleted from the table

#### Scenario: Garbage collection preserves non-deleted rows
- **WHEN** garbage collection is called and a table has rows with `deleted_at IS NULL` or `is_synced = 0`
- **THEN** those rows SHALL NOT be deleted

### Requirement: Purge synced outbox
The `SyncEngine` SHALL expose a `purge_synced_outbox` method that deletes `sync_outbox` rows where `synced_at IS NOT NULL AND synced_at < ?` (older than a given timestamp).

#### Scenario: Purge old synced outbox entries
- **WHEN** `purge_synced_outbox` is called with a timestamp
- **THEN** all outbox rows with `synced_at` older than the timestamp SHALL be deleted

### Requirement: get_sync_local_state
The `SyncEngine` SHALL expose a `get_sync_local_state` method that returns `LocalSyncState { local_dirty_count, last_server_watermark, needs_baseline_sync }`.

#### Scenario: Query local state with pending changes
- **WHEN** `get_sync_local_state` is called and the outbox has unsynced rows
- **THEN** `local_dirty_count` SHALL reflect the count of unsynced outbox rows

#### Scenario: Query local state with no cursor
- **WHEN** `get_sync_local_state` is called and no cursor exists in `sync_cursors`
- **THEN** `last_server_watermark` SHALL be empty and `needs_baseline_sync` SHALL be true

### Requirement: Client identity persistence
The sync engine SHALL persist a stable `clientId` (UUID v4) in a `sync_client_identity` table. On first sync, a new UUID SHALL be generated and stored. Subsequent syncs SHALL reuse the stored value.

#### Scenario: First sync generates client identity
- **WHEN** the sync engine is initialized and no `sync_client_identity` row exists
- **THEN** a new UUID v4 SHALL be generated, stored, and used as `client_id` for all sync requests

#### Scenario: Subsequent syncs reuse client identity
- **WHEN** the sync engine is initialized and a `sync_client_identity` row exists
- **THEN** the stored UUID SHALL be loaded and used as `client_id`

### Requirement: SyncNowResult type
The sync engine SHALL define a `SyncNowResult` struct with fields `mode: SyncNowMode`, `status: Option<SyncStatusResult>`, `pull: Option<PullResult>`, `push: Option<PushResult>`, `purged: usize`, and `skipped: Option<SyncNoOpResult>`.

#### Scenario: SyncNowResult contains all results
- **WHEN** a sync_now or sync_full_resync completes
- **THEN** the result SHALL contain the mode, optional status, optional pull result, optional push result, and garbage collection purged count
