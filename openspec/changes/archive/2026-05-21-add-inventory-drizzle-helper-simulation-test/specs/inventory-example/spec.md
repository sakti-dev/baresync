## ADDED Requirements

### Requirement: Helper-backed inventory repository simulation harness
The inventory example SHALL include a simulation-style test that creates a fresh in-memory database with the inventory schema and seeds representative rows for the helper-backed repository path.

#### Scenario: Helper-backed repository test starts with isolated database
- **WHEN** the simulation test runs
- **THEN** a fresh inventory database SHALL be created with the `locations`, `items`, and `stock_counts` tables
- **AND** the test SHALL seed rows needed to exercise status, pull, and push behavior

### Requirement: Helper-backed inventory repository full flow
The inventory example SHALL include a simulation-style test that exercises the helper-backed repository end to end by calling `loadSyncStatus`, `loadPullChanges`, and `applyPushChanges` against the seeded database.

#### Scenario: Helper-backed repository reads and writes a full sync cycle
- **WHEN** the test loads sync status, reads pull changes, applies push changes, and then reads sync status again
- **THEN** the repository SHALL return the expected table names, `changedTables`, cursor values, `changedRows`, and `deletedIds`
- **AND** `loadPullChanges` SHALL strip internal `syncUpdatedAt` data from returned rows
- **AND** `applyPushChanges` SHALL persist changed rows and soft-delete requested IDs in the database
- **AND** the final sync status SHALL reflect the mutated database state
