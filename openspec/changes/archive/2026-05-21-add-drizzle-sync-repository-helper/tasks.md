## 1. Drizzle Helper API

- [x] 1.1 Add `packages/baresync/src/server/drizzle.ts` with `createDrizzleSyncRepository`, `requiredString`, `optionalString`, and `requiredNumber`.
- [x] 1.2 Define helper option and repository return types, including table registry config, `buildRow` input, `tableNames`, `applyPushChanges`, `loadPullChanges`, and `loadSyncStatus`.
- [x] 1.3 Reuse existing server primitives for cursor parsing/formatting, table validation, pull table building, changed table detection, row splitting, and latest cursor row selection where applicable.
- [x] 1.4 Implement table-specific read callbacks for full and incremental pull/status queries using each table config's `readRows` and `readLatestRow`.
- [x] 1.5 Implement push application with table-name validation, explicit `buildRow` mapping, Drizzle upsert for changed rows, and soft delete updates for deleted IDs.
- [x] 1.6 Wire the `baresync/server/drizzle` package export path and generated type output.

## 2. Tests

- [x] 2.1 Add validation helper tests for `requiredString`, `optionalString`, and `requiredNumber`.
- [x] 2.2 Add repository tests for table-name validation and configured `tableNames`.
- [x] 2.3 Add repository tests for pull response table filtering and changed/deleted row splitting.
- [x] 2.4 Add repository tests for status changed table detection and no-change responses.
- [x] 2.5 Add repository tests for push upsert and soft delete behavior using the existing Drizzle/SQLite test setup, if feasible.

## 3. Inventory Example Adoption

- [x] 3.1 Add `examples/inventory/apps/server/src/db/drizzle-helper/sync-repository.ts` to use `createDrizzleSyncRepository` while preserving the primitive `primitive/sync-repository.ts` path.
- [x] 3.2 Replace inventory normalization helpers in the helper-backed path with explicit `buildRow` functions that use `requiredString`, `optionalString`, and `requiredNumber`.
- [x] 3.3 Remove local Drizzle sync mechanics from the helper-backed path that the new helper owns, including scoped reads, latest cursor row lookup, pull/status response assembly, push upsert, and soft delete loops.
- [x] 3.4 Keep existing inventory route handlers in `examples/inventory/apps/server/src/index.ts` mostly unchanged.
- [x] 3.5 Keep seed data and scope authorization outside the Drizzle repository helper.

## 4. Verification

- [x] 4.1 Run `bun x ultracite check`.
- [x] 4.2 Run `bun x ultracite fix` if safe formatting or lint fixes are reported, then re-run `bun x ultracite check`.
- [x] 4.3 Run the repository typecheck script.
- [x] 4.4 Run relevant package tests for `baresync/server/drizzle`.
- [x] 4.5 Run inventory example typecheck or build verification.
