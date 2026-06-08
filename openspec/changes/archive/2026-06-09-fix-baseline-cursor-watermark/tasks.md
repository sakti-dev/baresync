## 1. TDD Ground Rules

- [x] 1.1 Read `openspec/changes/fix-baseline-cursor-watermark/proposal.md`, `design.md`, and all delta specs before editing code.
- [x] 1.2 Follow strict red-green-refactor: write one failing test, run it and confirm the expected failure, implement the smallest production change, then rerun the focused test until it passes.
- [x] 1.3 Do not change production code before the corresponding failing test exists and has been run.
- [x] 1.4 Do not use `apply_pull_batch_tables_tx()` as the cursor-storage regression surface; it only applies rows and has no start-cursor or cursor-write-policy context.

## 2. Server Cursor Helper Tests

- [x] 2.1 RED: Add a failing test in `packages/baresync/src/server/__test__/service-primitives.test.ts` proving `formatSyncWatermarkCursor(1780915200000)` returns `"sync:1780915200000:__watermark__:__scope__"`.

Suggested test:

```ts
import { formatSyncWatermarkCursor } from "../service";

describe("formatSyncWatermarkCursor", () => {
  it("formats a synthetic server watermark cursor", () => {
    expect(formatSyncWatermarkCursor(1_780_915_200_000)).toBe(
      "sync:1780915200000:__watermark__:__scope__"
    );
  });
});
```

- [x] 2.2 RED: Run the focused test and confirm it fails because `formatSyncWatermarkCursor` is missing, not because of a typo.

Command:

```bash
bun test packages/baresync/src/server/__test__/service-primitives.test.ts --test-name-pattern "formatSyncWatermarkCursor"
```

- [x] 2.3 GREEN: Implement and export `formatSyncWatermarkCursor` in `packages/baresync/src/server/service.ts`.

Suggested production code:

```ts
const SYNC_WATERMARK_TABLE = "__watermark__";
const SYNC_WATERMARK_ROW = "__scope__";

export function formatSyncWatermarkCursor(syncUpdatedAt: number): string {
  return formatSyncCursor({
    rowId: SYNC_WATERMARK_ROW,
    syncUpdatedAt,
    tableName: SYNC_WATERMARK_TABLE,
  });
}
```

- [x] 2.4 GREEN: Ensure `formatSyncWatermarkCursor` is exported from `packages/baresync/src/server/index.ts` if server helpers are re-exported there.
- [x] 2.5 GREEN: Rerun the focused service primitive test and confirm it passes.
- [x] 2.6 RED: Add a second test proving `parseSyncCursor("sync:1780915200000:__watermark__:__scope__")` parses to `{ syncUpdatedAt: 1780915200000, tableName: "__watermark__", rowId: "__scope__" }`.
- [x] 2.7 GREEN: Run the focused service primitive tests and confirm both watermark helper tests pass without changing parser behavior.

## 3. Drizzle Repository Watermark Tests

- [x] 3.1 RED: Update the existing no-rows pull test in `packages/baresync/src/server/__test__/drizzle.test.ts` from expecting an empty cursor to expecting a non-empty synthetic watermark cursor.

Current test name to modify:

```ts
it("includes all tables by default and returns an empty cursor when no rows exist", async () => {
```

Rename to:

```ts
it("includes all tables by default and returns a watermark cursor when no rows exist", async () => {
```

Suggested assertions:

```ts
expect(response.cursor).toMatch(/^sync:\d+:__watermark__:__scope__$/);
expect(parseSyncCursor(response.cursor)).toMatchObject({
  rowId: "__scope__",
  tableName: "__watermark__",
});
```

- [x] 3.2 RED: Run only the updated Drizzle no-rows pull test and confirm it fails because the cursor is currently `""`.

Command:

```bash
bun test packages/baresync/src/server/__test__/drizzle.test.ts --test-name-pattern "watermark cursor when no rows exist"
```

- [x] 3.3 GREEN: Replace the internal Drizzle helper behavior in `packages/baresync/src/server/drizzle.ts` so no-row responses use a synthetic watermark cursor.

Suggested shape:

```ts
function nowMillis(): number {
  return Date.now();
}

function formatCursorOrWatermark(input: {
  latestRow: ReturnType<typeof latestCursorCandidate> | null;
  observedAt: number;
}): string {
  return input.latestRow
    ? formatLatestSyncCursor(input.latestRow)
    : formatSyncWatermarkCursor(input.observedAt);
}
```

Then in `buildPullResponse`:

```ts
const observedAt = nowMillis();
const serverTime = new Date(observedAt).toISOString();

return {
  cursor: formatCursorOrWatermark({ latestRow, observedAt }),
  hasMore: false,
  serverTime,
  tables: buildPullTables(...),
};
```

- [x] 3.4 GREEN: Rerun the focused Drizzle no-rows pull test and confirm it passes.
- [x] 3.5 RED: Add a no-rows status test in `packages/baresync/src/server/__test__/drizzle.test.ts` proving `loadSyncStatus({ cursor: "", scopeId: "missing" })` returns `hasChanges: false`, `changedTables: []`, and a non-empty synthetic watermark cursor.

Suggested test:

```ts
it("returns a watermark cursor when status has no rows", async () => {
  const repository = createRepository(createTestDb());

  const response = await repository.loadSyncStatus({
    cursor: "",
    scopeId: "missing",
  });

  expect(response.changedTables).toEqual([]);
  expect(response.hasChanges).toBe(false);
  expect(response.cursor).toMatch(/^sync:\d+:__watermark__:__scope__$/);
});
```

- [x] 3.6 RED: Run the focused status test and confirm it fails because status currently returns `""` for no rows.
- [x] 3.7 GREEN: Update `loadSyncStatus` in `packages/baresync/src/server/drizzle.ts` to use the same `formatCursorOrWatermark` behavior.
- [x] 3.8 GREEN: Rerun all Drizzle repository tests.

Command:

```bash
bun test packages/baresync/src/server/__test__/drizzle.test.ts
```

## 4. Rust Initial Baseline Table Scope Tests

- [x] 4.1 RED: Add a failing test in `crates/baresync-core/tests/simulation.rs` proving an uninitialized `sync_now()` full resync ignores status `changedTables` and pulls all contract tables.

Add near `sync_now_preserves_baseline_sync_when_local_cursor_missing`.

Suggested test:

```rust
#[tokio::test]
async fn sync_now_full_resync_pulls_all_tables_when_local_cursor_missing() {
    let pool = temp_db().await;

    let transport = RecordingTransport::new(
        response_with_table_ack("categories", vec![]),
        serde_json::json!({
            "changedTables": ["categories"],
            "hasChanges": true,
            "cursor": "sync:status",
            "serverTime": "2026-05-19T12:00:00.000Z",
        }),
        response_with_pull_tables(serde_json::json!([{
            "table": "categories",
            "changedRows": [],
            "deletedIds": []
        }, {
            "table": "products",
            "changedRows": [],
            "deletedIds": []
        }])),
    );
    let engine = test_engine_with_transport(pool, transport.clone(), "merchant-1").await;

    let result = engine.sync_now(1000).await.unwrap();

    assert_eq!(result.mode, baresync_core::engine::SyncNowMode::FullResync);
    let pull_request = &transport.calls()[1].1;
    assert_eq!(pull_request["cursor"], "");
    assert_eq!(
        pull_request["tables"],
        serde_json::json!(["categories", "products"])
    );
}
```

- [x] 4.2 RED: Run the focused test and confirm it fails because the pull request currently contains only `["categories"]`.

Command:

```bash
cargo test --package baresync-core sync_now_full_resync_pulls_all_tables_when_local_cursor_missing
```

- [x] 4.3 GREEN: In `crates/baresync-core/src/engine.rs`, change the `needs_baseline_sync` branch to pass `None` to `run_full_resync`.

Minimal change:

```rust
if local_state.needs_baseline_sync {
    return self.run_full_resync(limit, None, Some(status_result)).await;
}
```

- [x] 4.4 GREEN: Rerun the focused baseline table-scope test and confirm it passes.
- [x] 4.5 REFACTOR: If straightforward, simplify `run_full_resync` so it no longer accepts `changed_tables`; all full-resync callers should pull all contract tables. Keep focused tests green after refactor.
- [x] 4.6 GREEN: Rerun the existing incremental changed-table filter test to confirm incremental sync still uses `changedTables`.

Command:

```bash
cargo test --package baresync-core sync_now_pulls_changed_tables_without_push_when_local_is_clean
```

- [x] 4.7 GREEN: Rerun the existing reconciliation test to confirm rejected-table baseline filtering remains intact.

Command:

```bash
cargo test --package baresync-core sync_now_reconciles_rejected_tables_after_push
```

## 5. Rust Baseline Cursor Storage Tests

- [x] 5.1 RED: Add a failing test in `crates/baresync-core/tests/simulation.rs` proving a baseline `pull::pull(...)` stores the non-empty response cursor when no cursor exists.

Do not call `apply_pull_batch_tables_tx()` directly for this test.

Suggested test:

```rust
#[tokio::test]
async fn baseline_pull_stores_cursor_when_no_existing_cursor() {
    let pool = temp_db().await;
    let transport = RecordingTransport::new(
        response_with_table_ack("categories", vec![]),
        serde_json::json!({
            "changedTables": [],
            "hasChanges": false,
            "cursor": "sync:status",
            "serverTime": "2026-05-19T12:00:00.000Z",
        }),
        response_with_pull_tables(serde_json::json!([{
            "table": "categories",
            "changedRows": [],
            "deletedIds": []
        }])),
    );
    let engine = test_engine_with_transport(pool.clone(), transport, "merchant-1").await;

    let result = baresync_core::pull::pull(
        &pool,
        &engine.config,
        &engine.tables.upsert_order,
        &engine.tables.delete_order,
        &engine.tables.local_only_columns,
        1000,
        baresync_core::pull::PullStartCursor::Baseline,
        None,
    )
    .await
    .unwrap();

    assert_eq!(result.rows_received, 0);
    let cursor: String =
        db_scalar("SELECT last_cursor FROM sync_cursors WHERE scope_id = 'merchant-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(cursor, "sync:1716120000000:products:prod-1");
}
```

If `SyncEngine` fields are private and cannot be accessed from the test, call `engine.sync_now(1000)` instead and assert cursor afterward. The key is to exercise `pull::pull(...)` or `sync_now(...)`, not the low-level batch apply helper.

- [x] 5.2 RED: Run the focused test and confirm it fails because no cursor row is written.

Command:

```bash
cargo test --package baresync-core baseline_pull_stores_cursor_when_no_existing_cursor
```

- [x] 5.3 GREEN: Change `crates/baresync-core/src/pull.rs` cursor-write guard so a non-empty response cursor is stored for `PullStartCursor::Stored`, and also stored for `PullStartCursor::Baseline` only when `cursor::get_last_cursor(db, &config.scope_id)` returns empty.

Suggested implementation:

```rust
if !new_cursor.is_empty() {
    if matches!(start_cursor, PullStartCursor::Stored) {
        cursor::set_last_cursor_tx(db, &config.scope_id, &new_cursor)
            .await
            .map_err(SyncError::Database)?;
    } else if cursor::get_last_cursor(db, &config.scope_id)
        .await
        .map_err(SyncError::Database)?
        .is_empty()
    {
        cursor::set_last_cursor_tx(db, &config.scope_id, &new_cursor)
            .await
            .map_err(SyncError::Database)?;
    }
}
```

- [x] 5.4 GREEN: Rerun `baseline_pull_stores_cursor_when_no_existing_cursor` and confirm it passes.
- [x] 5.5 GREEN: Rerun existing `baseline_pull_does_not_advance_stored_cursor` and confirm it still passes.

Command:

```bash
cargo test --package baresync-core baseline_pull_does_not_advance_stored_cursor
```

- [x] 5.6 RED: Add or update an integration test proving `sync_now()` moves from `FullResync` on first sync to non-baseline state afterward.

Suggested test:

```rust
#[tokio::test]
async fn sync_now_clears_baseline_needed_after_successful_full_resync() {
    let pool = temp_db().await;
    let transport = RecordingTransport::new(
        response_with_table_ack("categories", vec![]),
        serde_json::json!({
            "changedTables": ["categories"],
            "hasChanges": true,
            "cursor": "sync:status",
            "serverTime": "2026-05-19T12:00:00.000Z",
        }),
        response_with_pull_tables(serde_json::json!([{
            "table": "categories",
            "changedRows": [],
            "deletedIds": []
        }, {
            "table": "products",
            "changedRows": [],
            "deletedIds": []
        }])),
    );
    let engine = test_engine_with_transport(pool, transport, "merchant-1").await;

    let result = engine.sync_now(1000).await.unwrap();
    assert_eq!(result.mode, baresync_core::engine::SyncNowMode::FullResync);

    let state = engine.get_sync_local_state().await.unwrap();
    assert_eq!(state.last_server_watermark, "sync:1716120000000:products:prod-1");
    assert!(!state.needs_baseline_sync);
}
```

- [x] 5.7 GREEN: Run the focused integration test and confirm it passes after the cursor-write change.

Command:

```bash
cargo test --package baresync-core sync_now_clears_baseline_needed_after_successful_full_resync
```

## 6. Empty Cursor Local State Tests

- [x] 6.1 RED or VERIFY: Add or confirm a test proving a stored empty cursor still reports `needs_baseline_sync=true`.

Search first:

```bash
rg -n "needs_baseline_sync|last_server_watermark|empty cursor" crates/baresync-core/src crates/baresync-core/tests
```

Suggested test location: `crates/baresync-core/src/state.rs` or `crates/baresync-core/tests/simulation.rs`.

Expected behavior:

```rust
assert_eq!(state.last_server_watermark, "");
assert!(state.needs_baseline_sync);
```

- [x] 6.2 GREEN: If no test exists, add it and run the focused state test. No production change should be needed unless the test exposes a regression.

## 7. Example Repository Alignment

- [x] 7.1 Inspect `examples/inventory-json-polling/apps/server/src/db/v1/primitive/sync-repository.ts`; it already uses `latestRow ?? getSeedCursor()` and may already return non-empty cursor for the seeded example.
- [x] 7.2 If the primitive example can serve missing scopes, update it to use `formatSyncWatermarkCursor(Date.now())` instead of a domain-specific seed cursor when no rows exist for the requested scope.
- [x] 7.3 Inspect `examples/inventory-json-polling/apps/server/src/db/v1/drizzle-helper/sync-repository.ts`; it delegates to `createDrizzleSyncRepository`, so it should inherit watermark behavior after the helper change.
- [x] 7.4 Run relevant example/server tests if any assertions depend on empty cursor behavior.

## 8. Spec And Documentation Consistency

- [x] 8.1 Search for stale language that says successful pull/status response cursors may be empty.

Command:

```bash
rg -n "cursor.*empty|empty cursor|watermark string or empty|when no .*row.*cursor.*empty" openspec packages examples crates
```

- [x] 8.2 Update source comments, tests names, and docs touched by this change so they say successful API responses return non-empty cursors.
- [x] 8.3 Do not edit archived OpenSpec change files unless a test or generated artifact directly requires it; current delta specs are the authoritative change record.

## 9. Full Verification

- [x] 9.1 Run all affected TypeScript server tests.

Command:

```bash
bun test packages/baresync/src/server/__test__/service-primitives.test.ts packages/baresync/src/server/__test__/drizzle.test.ts
```

- [x] 9.2 Run all baresync-core tests.

Command:

```bash
cargo test --package baresync-core
```

- [x] 9.3 Run Ultracite check.

Command:

```bash
bun x ultracite check
```

- [x] 9.4 If Ultracite reports formatting or safe fixable lint issues, run fix, then re-run check.

Command:

```bash
bun x ultracite fix
bun x ultracite check
```

- [x] 9.5 Run the repo typecheck script required by AGENTS.md.

Command:

```bash
bun run typecheck
```

- [x] 9.6 If any task changed desktop, Android, Tauri, fixture app, fixture backend, or `tests/e2e` smoke automation, read `openspec/knowledge/E2E-TESTING-RUNBOOK.md` and run the required E2E verification before claiming completion. This change should not require E2E unless implementation touches those areas.

## 10. Expected Final Behavior Checklist

- [x] 10.1 First sync with remote rows performs `FullResync`, pulls all contract tables, applies rows, stores the API cursor, and `needs_baseline_sync` becomes false.
- [x] 10.2 First sync with no remote rows performs `FullResync`, receives a synthetic watermark cursor, stores it after successful apply, and `needs_baseline_sync` becomes false.
- [x] 10.3 Failed baseline apply stores no cursor, leaving `needs_baseline_sync=true` for safe retry.
- [x] 10.4 Incremental pull still uses `status.changedTables` and advances stored cursor.
- [x] 10.5 Server-wins reconciliation baseline still pulls only rejected tables and preserves the existing cursor.
- [x] 10.6 A server returning `cursor: ""` remains fail-safe: the client does not store the empty cursor and remains baseline-needed.
