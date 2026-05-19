## Purpose

TBD. Host-side JS server simulation coverage for sync primitives and fixtures.

## ADDED Requirements

### Requirement: Server simulation test harness
The JS server simulation SHALL use `bun:sqlite` in-memory databases with Drizzle ORM, matching the existing test pattern in `server.test.ts`. Each test SHALL create a fresh database, seed schema, and tear down after the test.

#### Scenario: Test harness creates isolated database per test
- **WHEN** a simulation test starts
- **THEN** a fresh in-memory SQLite database SHALL be created with `sync_batch_requests` table and any tables needed by the test scenario

### Requirement: Baseline pull returns tables in FK order
The JS server simulation SHALL include a test proving that a pull response fixture containing both categories and products is processed in FK-safe order (categories before products for upserts).

#### Scenario: Pull response applied in FK order
- **WHEN** the baseline pull fixture is processed by `orderPushChanges` with upsert order `["categories", "products"]`
- **THEN** categories SHALL appear before products in the ordered result

### Requirement: Push with reversed order still writes in FK order
The JS server simulation SHALL include a test proving that incoming push changes arriving in reverse FK order are reordered by `orderPushChanges` before processing.

#### Scenario: Reversed push is reordered
- **WHEN** a push request contains products before categories
- **THEN** `orderPushChanges` SHALL return categories before products

### Requirement: Idempotent push replay
The JS server simulation SHALL include a test proving that the same `(clientId, idempotencyKey, requestHash)` replays the cached response without re-executing the callback.

#### Scenario: Second push replays cached response
- **WHEN** `createIdempotencyGuard.run` is called twice with identical `(clientId, idempotencyKey, requestHash)`
- **THEN** the callback SHALL be invoked exactly once
- **AND** both calls SHALL return the same response

### Requirement: Idempotency key conflict
The JS server simulation SHALL include a test proving that reusing an idempotency key with a different body returns a conflict error.

#### Scenario: Different body with same key triggers conflict
- **WHEN** `createIdempotencyGuard.run` is called with the same `(clientId, idempotencyKey)` but different `requestHash`
- **THEN** a `ConflictRequestError` SHALL be thrown

### Requirement: Oversized push returns 413
The JS server simulation SHALL include a test proving that `validatePushEnvelope` rejects a push body exceeding `maxBytes`.

#### Scenario: Push exceeding byte limit is rejected
- **WHEN** `validatePushEnvelope` is called with a body exceeding `maxBytes`
- **THEN** an error SHALL be thrown with code indicating payload too large

### Requirement: Row count overflow returns 413
The JS server simulation SHALL include a test proving that `validatePushEnvelope` rejects a push body exceeding `maxRows`.

#### Scenario: Push exceeding row limit is rejected
- **WHEN** `validatePushEnvelope` is called with more rows than `maxRows`
- **THEN** an error SHALL be thrown with code indicating payload too large

### Requirement: Invalid cursor returns 400
The JS server simulation SHALL include a test proving that `parseSyncCursor` throws on invalid cursor strings.

#### Scenario: Malformed cursor throws
- **WHEN** `parseSyncCursor` is called with a malformed string
- **THEN** an error SHALL be thrown with a descriptive message

### Requirement: Server soft delete returns deletedIds
The JS server simulation SHALL include a test proving that a server soft-delete pull response correctly surfaces `deletedIds`.

#### Scenario: Soft-delete fixture contains deletedIds
- **WHEN** the server-soft-delete fixture is loaded
- **THEN** the products table entry SHALL have `deletedIds: ["prod-1"]` and empty `changedRows`

### Requirement: Idempotency cleanup deletes old completed rows
The JS server simulation SHALL include a test proving that `cleanupSyncBatchRequests` deletes completed rows older than the specified threshold.

#### Scenario: Old completed rows are deleted
- **WHEN** `cleanupSyncBatchRequests` is called with `olderThanMs` set to 7 days
- **THEN** all completed rows older than 7 days SHALL be deleted
- **AND** newer completed rows SHALL be preserved

### Requirement: Idempotency cleanup dry-run reports without deleting
The JS server simulation SHALL include a test proving that `cleanupSyncBatchRequests` with `dryRun: true` reports counts without deleting.

#### Scenario: Dry-run does not delete
- **WHEN** `cleanupSyncBatchRequests` is called with `dryRun: true`
- **THEN** no rows SHALL be deleted from the database
- **AND** the reported count SHALL match the number of rows that would have been deleted

### Requirement: Idempotency cleanup preserves pending rows
The JS server simulation SHALL include a test proving that `cleanupSyncBatchRequests` preserves pending rows unless `stalePendingOlderThanMs` is explicitly set.

#### Scenario: Pending rows preserved by default
- **WHEN** `cleanupSyncBatchRequests` is called without `stalePendingOlderThanMs`
- **THEN** pending rows SHALL NOT be deleted regardless of age

### Requirement: Full server primitive pipeline
The JS server simulation SHALL include a test that exercises the complete low-level primitive pipeline: decode request → validate envelope → order changes → idempotency guard → encode response.

#### Scenario: Full pipeline processes valid push
- **WHEN** a valid push request is processed through the full pipeline
- **THEN** the response SHALL be a valid sync response body
- **AND** the idempotency guard SHALL record the request in `sync_batch_requests`

### Requirement: Pull with mixed changedRows and deletedIds on same table
The JS server simulation SHALL include a test proving that `orderPushChanges` correctly processes a changes array where a single table has both `changedRows` and `deletedIds`.

#### Scenario: Mixed upsert and delete on same table ordered correctly
- **WHEN** `orderPushChanges` is called with a table entry containing both changedRows and deletedIds
- **THEN** the table SHALL appear once in the ordered result
- **AND** both changedRows and deletedIds SHALL be preserved

### Requirement: Push with deletes only validates correctly
The JS server simulation SHALL include a test proving that `validatePushEnvelope` and `countPushRows` correctly handle a push body containing only deletedIds with no changedRows.

#### Scenario: Delete-only push passes validation
- **WHEN** `validatePushEnvelope` is called with a body containing only deletedIds
- **THEN** no error SHALL be thrown if within limits
- **AND** `countPushRows` SHALL count the deletedIds

### Requirement: Re-sync pipeline after idempotency conflict
The JS server simulation SHALL include a test proving that after a ConflictRequestError, a new request with a fresh idempotency key succeeds through the full pipeline.

#### Scenario: New key succeeds after conflict
- **WHEN** a first push with key `"key-1"` completes, then a conflicting hash is rejected, then a new push with key `"key-2"` is submitted
- **THEN** the new push SHALL complete successfully
- **AND** the idempotency table SHALL contain entries for both `"key-1"` and `"key-2"`
