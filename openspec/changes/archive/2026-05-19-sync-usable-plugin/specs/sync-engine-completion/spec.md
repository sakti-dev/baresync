## ADDED Requirements

### Requirement: sync_now orchestration
The `SyncEngine` SHALL expose a `sync_now` method that executes the full sync cycle: pull (stored cursor) → push → if rejected rows exist, pull (baseline, rejected tables only) → garbage collection. It SHALL return a `SyncNowResult` containing pull result, push result, and purged count.

#### Scenario: Full sync with no conflicts
- **WHEN** `sync_now` is called and there are local outbox changes and server pull changes
- **THEN** the engine SHALL first pull (stored cursor), then push all outbox changes, then run garbage collection, and return combined results

#### Scenario: Full sync with server-wins rejections
- **WHEN** `sync_now` is called and the push response contains rejected rows with reason "server_newer"
- **THEN** the engine SHALL perform a follow-up pull from baseline (empty cursor) scoped to only the rejected tables, apply the server's versions, and NOT advance the main cursor for this reconciliation pull

#### Scenario: Full sync with no local changes
- **WHEN** `sync_now` is called and the outbox is empty
- **THEN** the engine SHALL skip push and reconciliation, only pull and run garbage collection

#### Scenario: Full sync with no server changes
- **WHEN** `sync_now` is called and the pull response has zero rows
- **THEN** the engine SHALL proceed with push and garbage collection normally

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
The sync engine SHALL define a `SyncNowResult` struct with fields `pull: PullResult`, `push: PushResult`, `purged: usize`.

#### Scenario: SyncNowResult contains all results
- **WHEN** a sync_now or sync_full_resync completes
- **THEN** the result SHALL contain the pull result, push result, and garbage collection purged count
