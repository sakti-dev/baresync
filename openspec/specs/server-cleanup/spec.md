## ADDED Requirements

### Requirement: cleanupSyncBatchRequests
The server package SHALL export a `cleanupSyncBatchRequests` function that accepts `{ db, olderThanMs, stalePendingOlderThanMs?, limit?, dryRun? }` and deletes old completed rows from `sync_batch_requests`.

#### Scenario: Delete old completed rows
- **WHEN** `cleanupSyncBatchRequests` is called with `olderThanMs = 7 * 24 * 60 * 60 * 1000`
- **THEN** all completed rows (non-pending `status`) with `created_at` older than 7 days SHALL be deleted

#### Scenario: Preserve recent rows
- **WHEN** `cleanupSyncBatchRequests` is called with `olderThanMs = 7 * 24 * 60 * 60 * 1000` and rows exist newer than 7 days
- **THEN** rows newer than 7 days SHALL NOT be deleted

#### Scenario: Preserve pending rows by default
- **WHEN** `cleanupSyncBatchRequests` is called without `stalePendingOlderThanMs`
- **THEN** rows with `status = "pending"` SHALL NOT be deleted regardless of age

#### Scenario: Delete stale pending rows with explicit threshold
- **WHEN** `cleanupSyncBatchRequests` is called with `stalePendingOlderThanMs = 60 * 60 * 1000`
- **THEN** pending rows older than 1 hour SHALL be deleted

#### Scenario: Bounded deletes with limit
- **WHEN** `cleanupSyncBatchRequests` is called with `limit = 1000` and 5000 rows match
- **THEN** only 1000 rows SHALL be deleted

#### Scenario: Dry-run reports counts without deleting
- **WHEN** `cleanupSyncBatchRequests` is called with `dryRun = true`
- **THEN** the function SHALL return counts of matching rows without deleting any

### Requirement: Cleanup return value
`cleanupSyncBatchRequests` SHALL return `{ deletedCount: number, oldestDeleted?: string, newestDeleted?: string }`.

#### Scenario: Return value reflects deleted rows
- **WHEN** cleanup deletes 50 rows
- **THEN** the return value SHALL contain `deletedCount: 50` and the timestamps of the oldest and newest deleted rows
