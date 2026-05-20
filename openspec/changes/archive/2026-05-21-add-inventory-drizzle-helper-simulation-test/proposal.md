## Why

The inventory example now has two repository paths, but only the primitive path is exercised by simulation-style tests. That leaves the helper-backed `drizzle-helper` path as a documentation example instead of a verified example, which weakens the DX story for users who are expected to copy it.

## What Changes

- Add a focused simulation-style test for the helper-backed inventory repository flow.
- Exercise the real `examples/inventory/apps/server/src/db/drizzle-helper/sync-repository.ts` repository end to end with an isolated database.
- Verify the repository methods used by the app:
  - `loadSyncStatus`
  - `loadPullChanges`
  - `applyPushChanges`
- Prove that the helper-backed path preserves type-safe row mapping, changed/deleted row handling, cursor behavior, and database writes.
- Keep the primitive inventory path intact as the comparison/reference implementation.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `inventory-example`: add a repository-flow simulation test for the `drizzle-helper` path so the helper-backed example is verified end to end, not just shown in docs.

## Impact

- `examples/inventory/apps/server/src/db/drizzle-helper/sync-repository.ts`
- `examples/inventory/apps/server/src/db/drizzle-helper/utils.ts`
- `examples/inventory/apps/server/src/index.ts`
- inventory example tests under `examples/inventory/apps/server`
- OpenSpec inventory example requirements and related docs
