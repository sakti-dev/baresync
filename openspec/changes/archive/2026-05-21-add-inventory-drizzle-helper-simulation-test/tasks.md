## 1. Inventory test harness

- [x] 1.1 Add a repository-flow simulation test for `examples/inventory/apps/server/src/db/drizzle-helper/sync-repository.ts`.
- [x] 1.2 Create a fresh in-memory SQLite database for each test with the inventory schema and any helper setup needed for the repository.

## 2. Full repository flow coverage

- [x] 2.1 Seed representative `locations`, `items`, and `stock_counts` rows so status and pull queries have meaningful data.
- [x] 2.2 Assert `loadSyncStatus` and `loadPullChanges` return the expected table names, cursor values, changed rows, and deleted IDs.
- [x] 2.3 Assert `applyPushChanges` validates rows, persists upserts, soft-deletes requested IDs, and updates the database state visible to follow-up status checks.

## 3. Verification

- [x] 3.1 Run `bun x ultracite check`.
- [x] 3.2 Run the relevant inventory example typecheck and the new simulation test.
