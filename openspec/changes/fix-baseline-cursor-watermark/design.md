## Context

Baresync currently uses `sync_cursors.last_cursor` as the local marker that a scope has completed baseline synchronization. `get_sync_local_state()` reports `needs_baseline_sync=true` when the stored cursor value is empty. This is intentionally conservative: missing or empty local cursor means the client must pull from baseline before relying on incremental sync.

Two separate issues break that model today:

1. The Rust pull engine only stores response cursors for `PullStartCursor::Stored`. Initial `FullResync` calls `pull(..., PullStartCursor::Baseline, ...)`, so a successful first baseline pull can apply rows without storing the response cursor.
2. The public Drizzle server helper returns `cursor: ""` when no rows exist for the scope. That means a successful empty baseline cannot transition the client out of baseline-needed state.

There is also an orchestration risk: `sync_now()` currently passes status `changedTables` into `run_full_resync()` when `needs_baseline_sync=true`. An uninitialized client must pull all contract tables, not only status-reported changed tables, before storing a cursor.

The fix is a combined client/server contract change:

```text
Server invariant:
  Every successful pull/status response returns a valid non-empty cursor.

Client invariant:
  A non-empty stored cursor means this client successfully applied server state up to that cursor.
```

## Goals / Non-Goals

**Goals:**

- Make successful initial baseline sync store a server-owned cursor.
- Make empty remote datasets produce a non-empty server watermark cursor.
- Preserve conservative retry behavior when baseline application fails.
- Preserve server-wins reconciliation behavior: rejected-table baseline pulls must not overwrite the existing main cursor.
- Ensure first baseline pulls all contract tables regardless of status `changedTables`.
- Keep local initialization state value-based: missing or empty stored cursor means baseline is still required.
- Provide test-first implementation steps with expected failing tests before production changes.

**Non-Goals:**

- Do not introduce a new local initialization table.
- Do not treat `sync_cursors` row existence as initialized when `last_cursor = ""`.
- Do not let the client invent cursor values. Cursors remain API-owned.
- Do not change the existing cursor wire shape from `sync:<timestamp>:<tableName>:<rowId>`.
- Do not change reconciliation pull table filtering for rejected rows.
- Do not redesign pagination or chunking.

## Decisions

### Decision 1: Server returns synthetic watermark cursors for empty scopes

When no latest synced row exists, the server SHALL return a synthetic cursor that uses the existing cursor wire shape:

```text
sync:<server_observed_at_ms>:__watermark__:__scope__
```

Example:

```text
sync:1780915200000:__watermark__:__scope__
```

Rationale:

- Keeps cursor parsing unchanged: four colon-separated parts, numeric timestamp.
- Avoids adding a separate response field for initialization state.
- Makes empty remote scopes behave like any other successful sync.
- Keeps cursor ownership on the server.

Alternative considered: store an empty cursor row locally and treat row existence as initialized. Rejected because it weakens the server contract, adds local-state complexity, and can mask broken servers returning empty cursors.

### Decision 2: Use server observation time for synthetic cursors

The synthetic cursor timestamp SHALL come from the server sync clock at response construction time. In the current TypeScript helper, this can be `Date.now()` as long as pushed/server-created rows use the same server clock for `syncUpdatedAt`.

Implementation sketch:

```ts
export const SYNC_WATERMARK_TABLE = "__watermark__";
export const SYNC_WATERMARK_ROW = "__scope__";

export function formatSyncWatermarkCursor(syncUpdatedAt: number): string {
  return formatSyncCursor({
    rowId: SYNC_WATERMARK_ROW,
    syncUpdatedAt,
    tableName: SYNC_WATERMARK_TABLE,
  });
}
```

Rationale:

- Future writes with `syncUpdatedAt > watermark_timestamp` are visible to incremental status/pull.
- Empty initial baseline can safely store the watermark cursor.

Risk:

- If the server clock is not monotonic relative to future `syncUpdatedAt` values, later rows could be missed.

Mitigation:

- Use the same server-side sync clock for response watermarks and write `syncUpdatedAt`.
- Tests should assert the synthetic cursor parses and uses the expected timestamp shape, not a hard-coded wall-clock value.

### Decision 3: Keep local state value-based

`needs_baseline_sync` remains true when the stored cursor value is empty. A `sync_cursors` row with `last_cursor = ""` is treated as uninitialized/legacy/invalid state, not as successful initialization.

Rationale:

- With the server non-empty cursor invariant, empty cursor is not a valid successful state.
- Ambiguous local state should fail safe by repeating baseline.
- Existing behavior self-heals once a compliant server returns a non-empty cursor and the client stores it.

### Decision 4: Baseline cursor write is conditional on successful apply and missing cursor

The Rust pull engine SHALL only store a response cursor after local row/delete application succeeds.

Expected behavior:

```text
PullStartCursor::Stored:
  store non-empty response cursor after successful apply

PullStartCursor::Baseline and no existing stored cursor:
  store non-empty response cursor after successful apply

PullStartCursor::Baseline and existing stored cursor:
  do not overwrite the existing cursor
```

Implementation sketch in `crates/baresync-core/src/pull.rs`:

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

Rationale:

- Fixes first baseline initialization.
- Preserves the existing reconciliation invariant for clients that already have a cursor.
- Keeps failed applies retry-safe because cursor storage remains after `apply_pull_batch_tables_tx(...).await?`.

### Decision 5: Initial baseline ignores status changedTables

When `local_state.needs_baseline_sync` is true, `sync_now()` SHALL run full baseline pull with no table filter:

```rust
if local_state.needs_baseline_sync {
    return self.run_full_resync(limit, None, Some(status_result)).await;
}
```

Better implementation, if low-risk during the change:

```rust
async fn run_full_resync(
    &self,
    limit: i32,
    status_result: Option<SyncStatusResult>,
) -> Result<SyncNowResult, SyncError>
```

Then `run_full_resync()` always passes `None` as the pull table filter.

Rationale:

- An uninitialized local database cannot safely use changed-table filtering because it has no complete local snapshot.
- Storing a cursor after a filtered baseline could permanently skip remote rows from unrequested tables.

Reconciliation is not affected because rejected-table reconciliation uses direct `pull(..., PullStartCursor::Baseline, Some(&rejected_filter))` calls and does not go through `run_full_resync()`.

## Risks / Trade-offs

- **Risk: Third-party servers still return `cursor: ""` for successful pull/status.** → Mitigation: client treats empty cursor as uninitialized and retries baseline; specs and tests make non-empty cursor a server requirement.
- **Risk: Synthetic watermark timestamp can miss future rows if server writes use non-monotonic timestamps.** → Mitigation: use one server sync clock for watermarks and row `syncUpdatedAt`; document this invariant in specs.
- **Risk: Baseline cursor write could overwrite reconciliation cursor.** → Mitigation: only write baseline cursor when `get_last_cursor(...)` returns empty; keep existing `baseline_pull_does_not_advance_stored_cursor` test green.
- **Risk: First baseline with filtered tables can mark incomplete local data initialized.** → Mitigation: `needs_baseline_sync=true` uses `run_full_resync(..., None, ...)`; add regression test that status `changedTables=["categories"]` still sends all contract tables.
- **Risk: The existing draft regression test might call `apply_pull_batch_tables_tx()` directly.** → Mitigation: do not use that function for cursor storage tests; it has no cursor/write-policy context. Use `pull::pull(...)` or `engine.sync_now(...)`.

## Migration Plan

1. Implement server helper tests and server helper changes first.
2. Implement Drizzle repository tests and helper changes next.
3. Implement Rust engine tests for unfiltered baseline and baseline cursor storage.
4. Implement Rust pull/engine changes.
5. Update specs and example expectations as needed.
6. Run verification:
   - `bun x ultracite check`
   - package/server tests covering changed TypeScript helpers
   - `cargo test --package baresync-core`
   - repository typecheck script

Rollback:

- Reverting the server watermark change reintroduces empty remote baseline loops.
- Reverting the Rust cursor-storage change reintroduces repeated `FullResync`.
- If rollback is required, revert both server and client behavior together to avoid mixed contracts.

## Open Questions

None for implementation. The selected approach is:

```text
server always returns non-empty successful cursor
client stores API cursor only after successful apply
first baseline pulls all tables
empty local cursor remains uninitialized
```
