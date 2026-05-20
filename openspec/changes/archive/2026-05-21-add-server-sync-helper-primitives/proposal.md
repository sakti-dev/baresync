## Why

The inventory server example currently requires users to copy a large amount of repository plumbing before they can understand the sync-specific parts of a server integration. Small public helper primitives can reduce that upfront complexity without introducing a larger Drizzle repository abstraction yet.

## What Changes

- Add framework-neutral server helper primitives for common pull/status repository chores:
  - parsing a cursor to a timestamp fallback
  - splitting selected rows into changed rows and deleted IDs
  - building filtered pull table responses
  - deriving changed table names for status responses
  - validating table names against a known table list
  - formatting a latest cursor row
- Keep app-owned repository logic, table queries, Drizzle writes, scope authorization, and row validation explicit.
- Update the inventory server repository to use the helper primitives so the example remains manual but less noisy.
- Add tests for the new helper primitives.
- No breaking changes.

## Capabilities

### New Capabilities

### Modified Capabilities

- `server-low-level-primitives`: Adds small repository-oriented helper primitives to the public server export path.
- `inventory-example`: Updates the canonical inventory server repository to demonstrate the helper primitives.

## Impact

- Affected code: `packages/baresync/src/server/service.ts`, `packages/baresync/src/server/index.ts`, server primitive tests, and `examples/inventory/apps/server/src/db/repository.ts`.
- Public API: additive exports from `baresync/server`.
- Dependencies: none.
- Runtime behavior: intended to be equivalent to the existing inventory example behavior.
