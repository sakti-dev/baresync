## 1. Interface Changes (compile-time prerequisites for tests)

- [x] 1.1 Widen `SyncTransaction` interface in `packages/baresync/src/tauri/client.ts` — change `.values()` return type from `Promise<unknown> | unknown` to `PromiseLike<unknown> & { onConflictDoUpdate(config: { target: unknown[]; targetWhere?: unknown; set: Record<string, unknown> }): Promise<unknown> }`
- [x] 1.2 Add `import { sql } from "drizzle-orm"` to `packages/baresync/src/tauri/client.ts` (pattern already exists in `local-schema.ts`)

## 2. RED — Write Failing Tests

- [x] 2.1 Create test helper that sets up an in-memory libsql database with the `sync_outbox` schema (partial unique index included) — this is the test infrastructure, not production code
- [x] 2.2 Update existing `createRecordingTx` mock to support `onConflictDoUpdate` chaining (backward compat for existing non-coalescing tests) — verify existing tests still pass after mock change
- [x] 2.3 Write test: single enqueue with no existing row — plain insert, outbox has one row with matching operation
- [x] 2.4 Write test: enqueue "insert" then "update" for same row — outbox has single row with operation "insert" (coalesced)
- [x] 2.5 Write test: enqueue "update" then "update" for same row — outbox has single row with operation "update"
- [x] 2.6 Write test: enqueue after previous row synced (synced_at set) — fresh insert, no conflict, two outbox rows total
- [x] 2.7 Write test: conflict always updates `changedAt` timestamp
- [x] 2.8 Run tests — verify all new coalescing tests FAIL (existing tests must still pass)

## 3. GREEN — Minimal Implementation

- [x] 3.1 Rewrite `enqueueChange` method body — chain `.onConflictDoUpdate()` after `.values()` with `target: [syncOutbox.tableName, syncOutbox.rowId]`, `targetWhere: sql\`${syncOutbox.syncedAt} IS NULL\``, and `set` containing the SQL CASE expression for operation coalescing plus `changedAt` refresh
- [x] 3.2 Run tests — verify ALL tests pass (new coalescing tests + existing tests)

## 4. REFACTOR — Clean Up

- [x] 4.1 Run full test suite (`bun test` in `packages/baresync`) — verify no regressions, output pristine
- [x] 4.2 Run `bun x ultracite check` — fix any formatting/lint issues

## 5. Spec Sync

- [x] 5.1 Sync the delta spec changes to `openspec/specs/js-sync-client/spec.md` (update the "Explicit enqueue primitive" requirement with upsert coalescing scenarios)

## 6. Version

- [x] 6.1 Bump `packages/baresync/package.json` version (patch bump — bug fix that makes previously-crashing code work)
