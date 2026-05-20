## Context

Option 1 added backend-neutral server helper primitives and updated the inventory repository to use them. That reduced generic sync plumbing, but the inventory server still has app code for repeated Drizzle mechanics: per-table scoped reads, latest cursor row lookup, pull/status response assembly, push upserts, and soft deletes.

This change explores a higher-level helper specifically for Drizzle users. The helper should live under `baresync/server/drizzle` so it is clearly separate from the backend-neutral `baresync/server` primitives. The API can be evaluated in the inventory example before deciding whether it should be treated as a broadly published/stable surface.

## Goals / Non-Goals

**Goals:**

- Add a Drizzle-targeted repository helper that builds push, pull, and status repository methods from explicit per-table callbacks.
- Keep scope authorization outside the helper and inside the existing route handler setup.
- Keep app-owned row validation/defaulting explicit in each table config's `buildRow`.
- Reuse existing server primitives for cursor parsing/formatting, row splitting, table filtering, changed table detection, latest cursor row selection, and table validation where practical.
- Update the inventory example to show the reduced repository shape.
- Add focused tests around registry validation, pull/status behavior, and push writes.

**Non-Goals:**

- Do not add a generic ORM abstraction.
- Do not replace app-specific row validation with schema inference or magic mappers.
- Do not add pagination; the helper should keep `hasMore: false`.
- Do not move scope authorization into the helper.
- Do not make a final product decision about whether this helper is documented as stable/public beyond adding the export path.
- Do not change sync wire formats or handler APIs.

## Decisions

### Add `baresync/server/drizzle` as a separate export path

The helper will be implemented in `packages/baresync/src/server/drizzle.ts` or an equivalent source path and wired through package exports as `baresync/server/drizzle`.

This keeps Drizzle-specific imports and types out of the backend-neutral `baresync/server` module. It also leaves room to evaluate the helper independently before deciding how broadly to publish or document it.

**Alternatives considered:** Add the helper directly to `baresync/server`. Rejected because the existing module is intentionally backend-neutral and should not require consumers to mentally separate generic primitives from Drizzle-specific helpers.

### Use explicit table callbacks as the abstraction boundary

The helper will accept a table registry keyed by sync table name.

Each table config will include:

- `buildRow`: app-owned validation/defaulting for incoming changed rows
- `readLatestRow`: latest-row lookup for cursor formatting
- `readRows`: scoped pull/status reads for a cursor timestamp
- `softDeleteRow`: app-specific soft delete write
- `upsertRow`: app-specific upsert write

The returned repository will expose:

- `tableNames`
- `applyPushChanges({ changes, scopeId, syncUpdatedAt })`
- `loadPullChanges({ cursor, scopeId, tables })`
- `loadSyncStatus({ cursor, scopeId })`

**Alternatives considered:** Generate the row mapper from Drizzle table metadata. Rejected because validation semantics are app-specific and the user explicitly wants `buildRow` to remain visible.

### Keep validation helpers intentionally small

The `baresync/server/drizzle` path will export:

- `requiredString(value, label)`
- `optionalString(value)`
- `requiredNumber(value, label)`

These helpers support readable `buildRow` functions without becoming a full validation library.

**Alternatives considered:** Add a schema validator integration. Rejected because it adds dependency and design weight before the helper shape is proven.

### Use the existing sync primitive semantics

The helper should use the same semantics as option 1:

- parse pull/status cursor timestamps with existing cursor helpers
- validate push table names against the registry
- select rows by `scopeId`
- select incremental rows by `syncUpdatedAt > cursor.syncUpdatedAt`
- split changed/deleted rows by `deletedAt`
- omit `syncUpdatedAt` from returned changed rows
- pick the latest cursor row across all configured tables
- build pull/status responses with current `serverTime` and `hasMore: false`

**Alternatives considered:** Let apps pass callbacks for reads and writes. Rejected because that returns to option 1-style manual plumbing and does not clarify the option 2 shape.

## Risks / Trade-offs

- [Risk] Drizzle type inference may be difficult across arbitrary table objects and column references. Mitigation: keep the first implementation pragmatic and preserve concrete row types through explicit table callbacks rather than trying to model every Drizzle table shape perfectly.
- [Risk] The helper could hide too much app behavior. Mitigation: keep `buildRow` explicit and require apps to provide `scopeColumn` and table registry names.
- [Risk] Upsert target assumptions may not hold for every table. Mitigation: keep the helper small and let the app own write semantics inside `upsertRow` and `softDeleteRow`.
- [Risk] The helper may not be worth publishing broadly. Mitigation: add it under a narrow Drizzle export path and evaluate it through the inventory example before expanding documentation.
- [Risk] Tests may need a real SQLite/Drizzle database. Mitigation: use the existing Bun SQLite and Drizzle test setup where feasible; otherwise prioritize deterministic tests for registry, pull/status assembly, and helper validation.
