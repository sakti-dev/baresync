## Why

The inventory server example still requires users to hand-write repeated Drizzle repository mechanics after option 1: per-table reads, latest cursor selection, pull/status response assembly, push upserts, and soft deletes. A smaller Drizzle-targeted helper can show the shape of a higher-level integration while keeping app-owned row validation explicit.

This change is intentionally exploratory from a public API perspective. It should be implemented behind the `baresync/server/drizzle` export path so the shape can be evaluated, but the decision to publish or document it broadly can remain separate.

## What Changes

- Add a Drizzle-focused server repository helper under `baresync/server/drizzle`.
- Provide `createDrizzleSyncRepository` for defining synced Drizzle tables once and receiving push, pull, and status repository methods.
- Provide small row validation helpers for app-owned `buildRow` functions:
  - `requiredString`
  - `optionalString`
  - `requiredNumber`
- Validate push table names against the configured table registry.
- Use existing server sync primitives for cursor parsing/formatting, pull table response construction, changed table detection, row splitting, latest cursor row selection, and table validation where applicable.
- Keep scope authorization outside the helper.
- Keep app-specific row validation and defaulting inside explicit `buildRow` functions.
- Update the inventory server repository to demonstrate the helper shape.
- Add focused tests for registry validation, pull/status response construction, row splitting behavior through the helper, and push upsert/soft delete where feasible.
- No breaking changes.

## Capabilities

### New Capabilities

- `server-drizzle-repository-helper`: Covers the Drizzle-targeted repository helper, validation helpers, expected returned repository API, and sync semantics.

### Modified Capabilities

- `inventory-example`: Updates the canonical inventory server repository to demonstrate the Drizzle helper while keeping route handlers and app-owned row validation visible.

## Impact

- Affected code:
  - `packages/baresync/src/server/drizzle.ts` or equivalent source path
  - package export wiring for `baresync/server/drizzle`
  - focused tests for the new helper
  - `examples/inventory/apps/server/src/db/primitive/sync-repository.ts`
  - `examples/inventory/apps/server/src/db/drizzle-helper/sync-repository.ts`
  - related inventory server types/imports as needed
- Public API:
  - additive `baresync/server/drizzle` export path
  - additive helper exports `createDrizzleSyncRepository`, `requiredString`, `optionalString`, and `requiredNumber`
- Dependencies:
  - no new runtime dependency beyond existing `drizzle-orm`
- Runtime behavior:
  - inventory sync behavior should remain equivalent to the current example
  - inventory route handlers should remain mostly unchanged
