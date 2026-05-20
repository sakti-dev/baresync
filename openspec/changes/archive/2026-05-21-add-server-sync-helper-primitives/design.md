## Context

Baresync already exposes low-level server primitives for decoding requests, encoding responses, cursor formatting/parsing, push ordering, and handler composition. The inventory server example still has to implement several generic sync chores in its repository: cursor timestamp fallback, row splitting, requested table filtering, status changed-table detection, and table-name validation.

This change intentionally targets those small repeatable chores. It does not introduce a Drizzle repository abstraction yet; users should still see and own their app's queries, writes, scope authorization, and row validation.

## Goals / Non-Goals

**Goals:**

- Add public helper primitives under `baresync/server` for common repository-level sync response work.
- Make the helpers backend-neutral and usable with Drizzle, raw SQL, or another server persistence layer.
- Keep the helper inputs plain objects and arrays so examples can adopt them incrementally.
- Update the inventory repository to demonstrate the reduced ceremony while preserving existing behavior.
- Add focused unit tests for the helper behavior.

**Non-Goals:**

- Do not add `baresync/server/drizzle` or a batteries-included Drizzle repository helper in this change.
- Do not change sync request/response wire formats.
- Do not change handler factory behavior.
- Do not hide app-specific row validation or domain defaults behind generic mappers.
- Do not add pagination or change the current `hasMore: false` inventory behavior.

## Decisions

### Add small backend-neutral helpers to server primitives

The helper set will live beside existing server primitives and operate on plain values. The proposed helpers are:

- `parseSyncCursorTimestamp(cursor)` returns the parsed cursor timestamp or `0` for an empty cursor.
- `splitSyncRows(rows)` returns `{ changedRows, deletedIds }`, treating `deletedAt === null` as changed and omitting `syncUpdatedAt` from changed rows.
- `buildPullTables({ allTables, requestedTables, changes })` returns pull table entries for requested tables, defaulting to all known tables when the request list is empty.
- `changedTableNames({ allTables, changes })` returns known table names with any changed rows or deleted IDs.
- `validateSyncTable(table, allowedTables)` narrows a string to a known table name or throws a descriptive error.
- `formatLatestSyncCursor(row)` formats `{ id, tableName, syncUpdatedAt }` through the existing cursor formatter.

**Alternatives considered:** Add a Drizzle-specific repository now. Rejected for this change because the user wants to try the smaller option first and because helper primitives can be adopted without committing to a larger abstraction boundary.

### Keep latest-row selection outside the helper set

The inventory repository still needs per-table latest-row queries because those are persistence-specific and currently written with Drizzle table objects. The helper set should not accept query builders or database handles.

**Alternatives considered:** Add `readLatestCursorRow` helper. Rejected because it would need either a database adapter or a callback protocol, which starts to resemble option 2.

### Keep push writes explicit

`validateSyncTable` improves table-name safety, but the actual push write branches stay in the app repository. This preserves visibility into row builders, upsert targets, and soft-delete writes.

**Alternatives considered:** Add generic upsert/soft-delete helpers. Rejected because they would be Drizzle-specific and would blur the boundary between option 1 and option 2.

## Risks / Trade-offs

- [Risk] The helper list may feel like many small exports. Mitigation: document them as repository composition helpers and demonstrate them together in the inventory repository.
- [Risk] `splitSyncRows` assumes the standard Baresync soft-delete shape. Mitigation: type it around `id`, `deletedAt`, and `syncUpdatedAt`, and leave custom deletion semantics to app code.
- [Risk] The example still contains manual per-table logic. Mitigation: this is intentional for option 1; a later Drizzle repository helper can build on the pain that remains.
- [Risk] Invalid requested pull table names could either be echoed as empty tables or rejected. Mitigation: `buildPullTables` should only return known tables and ignore unknown requested names; push table names remain strict through `validateSyncTable`.
