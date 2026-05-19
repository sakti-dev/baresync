## ADDED Requirements

### Requirement: Rust simulation test harness
The Rust engine simulation SHALL use temporary file-backed SQLite databases (matching the existing `temp_db()` pattern in `simulation.rs`). Each test SHALL create a fresh database with schema tables, seed test data, and clean up temp files.

#### Scenario: Test harness creates isolated temp database
- **WHEN** a simulation test starts
- **THEN** a fresh SQLite database SHALL be created in a temp directory with categories, products, sync_outbox, and sync_cursors tables

### Requirement: Baseline pull applies rows in FK-safe order
The Rust simulation SHALL include a test proving that a baseline pull response applies categories before products, respecting FK dependencies.

#### Scenario: Categories applied before products
- **WHEN** a pull response containing both categories and products is applied
- **THEN** categories SHALL be upserted first (parent), then products (child)
- **AND** all applied rows SHALL have `is_synced = 1`

### Requirement: Local offline writes create outbox rows
The Rust simulation SHALL include a test proving that inserting a category and product locally creates corresponding outbox entries.

#### Scenario: Insert creates outbox entries
- **WHEN** a category row is inserted via `push::upsert_row` and a product row is inserted
- **THEN** `sync_outbox` SHALL contain entries for both tables

### Requirement: Push reads outbox in generated order and clears accepted
The Rust simulation SHALL include a test proving that push reads outbox changes in upsert order (categories before products) and clears accepted outbox rows.

#### Scenario: Push clears accepted outbox
- **WHEN** outbox contains pending category and product changes
- **THEN** the push function SHALL read changes in upsert order
- **AND** after successful push, accepted outbox rows SHALL be marked as synced

### Requirement: Pull deletedIds soft-deletes local rows
The Rust simulation SHALL include a test proving that a pull response with `deletedIds` sets `deleted_at` on local rows.

#### Scenario: Pull soft-deletes rows in deletedIds
- **WHEN** a pull response contains `deletedIds: ["prod-1"]` for products
- **THEN** the product row SHALL have `deleted_at` set to the server time
- **AND** `is_synced` SHALL be set to 1

### Requirement: Rejected server-wins push reconciled by follow-up pull
The Rust simulation SHALL include a test proving that when a push is rejected with `server_newer`, a follow-up baseline pull overwrites the local row with the server version.

#### Scenario: Server-wins reconciliation
- **WHEN** a push response marks a category as rejected with reason `server_newer`
- **THEN** a follow-up pull SHALL apply the server's version of the category
- **AND** the local category row SHALL reflect the server's field values

### Requirement: Adaptive chunking splits on simulated 413
The Rust simulation SHALL include a test proving that when a push chunk receives a 413 response, the chunk is split and retried.

#### Scenario: 413 triggers split-retry
- **WHEN** a push chunk of 4 rows receives a simulated 413 response
- **THEN** the chunk SHALL be split into two halves
- **AND** both halves SHALL be pushed separately

### Requirement: Single oversized row returns error
The Rust simulation SHALL include a test proving that a single-row chunk that receives 413 returns `SingleRowTooLarge` error.

#### Scenario: Single row too large
- **WHEN** a single-row push chunk receives a 413 response
- **THEN** the push SHALL fail with a single-row-too-large error

### Requirement: Cursor advances only after applied rows
The Rust simulation SHALL include a test proving that the sync cursor is updated only after rows are successfully applied.

#### Scenario: Cursor updates after successful pull
- **WHEN** a pull response with cursor `"sync:1700000000:products:prod-1"` is applied
- **THEN** `sync_cursors` SHALL store the new cursor value

#### Scenario: Cursor does not update on failed pull
- **WHEN** a pull apply fails midway
- **THEN** `sync_cursors` SHALL retain the previous cursor value

### Requirement: Garbage collection purges soft-deleted synced rows
The Rust simulation SHALL include a test proving that GC deletes rows where `deleted_at IS NOT NULL AND is_synced = 1`.

#### Scenario: GC removes deleted synced rows
- **WHEN** a product has `deleted_at` set and `is_synced = 1`
- **THEN** `run_garbage_collection` SHALL delete that row
- **AND** non-deleted rows SHALL remain

### Requirement: Full sync lifecycle
The Rust simulation SHALL include a test that exercises the complete lifecycle: seed server → baseline pull → local writes → push → server delete → pull → GC → idempotent re-sync (no-op).

#### Scenario: Full lifecycle completes without error
- **WHEN** the full lifecycle test runs
- **THEN** baseline pull SHALL apply server rows
- **AND** local writes SHALL create outbox entries
- **AND** push SHALL clear outbox
- **AND** server delete pull SHALL soft-delete local rows
- **AND** GC SHALL purge deleted synced rows
- **AND** a second sync SHALL be a no-op (no rows pushed or pulled)

### Requirement: Migration runner applies embedded migrations once
The Rust simulation SHALL include a test proving that embedded migrations are applied on first run and skipped on second run.

#### Scenario: Migrations applied once
- **WHEN** `run_migrations` is called with embedded migrations
- **THEN** the migrations SHALL be applied
- **AND** calling `run_migrations` again SHALL skip all migrations

### Requirement: Drizzle proxy batch rolls back on failure
The Rust simulation SHALL include a test proving that `run_sql_batch` rolls back all statements when one fails.

#### Scenario: Batch rolls back on statement failure
- **WHEN** `run_sql_batch` is called with 3 statements and the second fails
- **THEN** the first statement's effects SHALL be rolled back
- **AND** the batch SHALL return an error

### Requirement: Push with partial acceptance
The Rust simulation SHALL include a test proving that when a push response accepts some rows and rejects others in the same table, only the accepted rows are marked synced and the rejected rows remain in the outbox.

#### Scenario: Accepted rows marked synced, rejected rows remain
- **WHEN** a push response accepts `"cat-1"` but rejects `"cat-2"` with reason `server_newer`
- **THEN** `cat-1` SHALL be marked `is_synced = 1` and its outbox entry SHALL have `synced_at` set
- **AND** `cat-2` SHALL remain `is_synced = 0` and its outbox entry SHALL have `synced_at = NULL`

### Requirement: Re-sync after server-wins reconciliation
The Rust simulation SHALL include a test proving that after a server-wins rejection and reconciliation pull, a second push of new local changes succeeds cleanly.

#### Scenario: Second push succeeds after reconciliation
- **WHEN** a category push is rejected with `server_newer`, reconciliation pull applies the server version, then a new local write creates a new outbox entry
- **THEN** the second push SHALL read the new outbox entry and build a valid push envelope
- **AND** after simulated acceptance, the new outbox entry SHALL be marked synced

### Requirement: Outbox coalescing insert→delete→insert
The Rust simulation SHALL include a test proving that three sequential outbox operations on the same row (insert, then delete, then insert) result in a single insert change (not a delete or no-op).

#### Scenario: Three operations coalesce to final insert
- **WHEN** outbox contains insert, then delete, then insert for row `"cat-1"`
- **THEN** `read_unsynced_table_changes_from_outbox_tx` SHALL return one changed row (insert/update)
- **AND** no deleted_ids for that row

### Requirement: Pull with hasMore triggers second batch
The Rust simulation SHALL include a test proving that a pull response with `hasMore: true` followed by a second pull response with `hasMore: false` applies rows from both batches and advances the cursor to the final batch's cursor.

#### Scenario: Paginated pull applies both batches
- **WHEN** the first pull returns 1 product with `hasMore: true` and cursor `"sync:step1"`, and the second returns 1 category with `hasMore: false` and cursor `"sync:step2"`
- **THEN** both rows SHALL be applied
- **AND** the cursor SHALL be `"sync:step2"`

### Requirement: Pull with mixed changedRows and deletedIds on same table
The Rust simulation SHALL include a test proving that a single pull response can contain both changedRows and deletedIds for the same table, and both are applied correctly.

#### Scenario: Same table has upserts and soft-deletes
- **WHEN** a pull response for products has `changedRows: [prod-2]` and `deletedIds: ["prod-1"]`
- **THEN** `prod-2` SHALL be upserted with `is_synced = 1`
- **AND** `prod-1` SHALL have `deleted_at` set and `is_synced = 1`

### Requirement: Push with deletes only
The Rust simulation SHALL include a test proving that a push containing only deletedIds (no changedRows) builds a valid envelope and, after acceptance, marks the outbox entries as synced.

#### Scenario: Delete-only push clears outbox
- **WHEN** outbox contains only delete operations for `"cat-1"`
- **THEN** `flatten_pending_tables` SHALL produce units with `deleted_id: Some("cat-1")` and `row: None`
- **AND** after simulated acceptance, the outbox entry SHALL be marked synced
