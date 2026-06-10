## Context

The `sync_outbox` table has a partial unique index on `(table_name, row_id) WHERE synced_at IS NULL`, enforcing at most one pending outbox entry per row. The `enqueueChange` method currently does a plain `INSERT`, which violates this constraint when called twice for the same row before sync runs. The Rust push engine already coalesces multiple outbox operations per row at push time (in `crates/baresync-core/src/schema.rs`'s `coalesce_operation`), but the JS client lacks the corresponding enqueue-time coalescing.

The `SyncTransaction` interface currently defines `.values()` as returning `Promise<unknown> | unknown`, which erases Drizzle's builder chain and prevents `.onConflictDoUpdate()` from being called.

Drizzle ORM version is 0.45.2, which supports `targetWhere` for partial unique index targeting (added in 0.30.8) and `sql` tagged template expressions inside `set` objects.

## Goals / Non-Goals

**Goals:**
- `enqueueChange` never crashes on duplicate `(table_name, row_id)` enqueue
- Operation coalescing preserves `"insert"` semantics when the existing operation is `"insert"` (server never saw the row)
- `changedAt` always reflects the latest enqueue time
- `id` and `scopeId` are preserved from the original outbox entry on conflict

**Non-Goals:**
- Adding `"delete"` to `LocalChangeOperation` type
- Handling delete-related coalescing cases (`insert+delete`, `update+delete`, etc.)
- Changing the Rust push engine's coalescing logic
- Changing the outbox schema or partial unique index

## Decisions

### Decision 1: Use `onConflictDoUpdate` with SQL CASE expression

The coalescing is expressed as a SQL CASE inside the `set` map:

```ts
operation: sql`CASE
  WHEN ${syncOutbox.operation} = 'insert' THEN 'insert'
  ELSE ${options.operation}
END`,
```

**Rationale**: Single SQL statement, atomic with the insert attempt, no read-before-write. The CASE evaluates the existing row's operation column — if `"insert"`, the result stays `"insert"` regardless of the new operation. Otherwise, the new operation wins.

**Alternative considered**: Read existing row first, decide in JS, then INSERT or UPDATE. Rejected because it requires two round trips and is not atomic.

### Decision 2: Include `targetWhere` matching the partial unique index

```ts
targetWhere: sql`${syncOutbox.syncedAt} IS NULL`,
```

**Rationale**: SQLite requires the `ON CONFLICT` clause to include the `WHERE` predicate when targeting a partial unique index. Without `targetWhere`, SQLite cannot resolve the conflict target and the upsert fails.

### Decision 3: Widen `SyncTransaction` interface to `PromiseLike` with `onConflictDoUpdate`

```ts
export interface SyncTransaction {
  insert(table: unknown): {
    values(values: Record<string, unknown>): PromiseLike<unknown> & {
      onConflictDoUpdate(config: {
        target: unknown[];
        targetWhere?: unknown;
        set: Record<string, unknown>;
      }): Promise<unknown>;
    };
  };
}
```

**Rationale**: Drizzle's actual insert builder implements `PromiseLike` and exposes chainable methods. The current type erases this. Widening makes the interface honest about what `enqueueChange` needs. Drizzle transactions already satisfy this — only test mocks need updating.

### Decision 4: Use real SQLite database in tests instead of mocking the builder chain

**Rationale**: Mocking Drizzle's `onConflictDoUpdate` builder chain is fragile and doesn't validate actual SQL execution. An in-memory SQLite instance (`bun:sqlite` + `drizzle-orm/bun-sqlite`) lets tests exercise the real INSERT … ON CONFLICT path, including partial unique index enforcement and CASE expression evaluation. Originally considered `@libsql/client` but switched to `bun:sqlite` for zero-dependency, in-process execution.

## Risks / Trade-offs

- **SyncTransaction interface change**: Technically breaking for anyone who implemented `SyncTransaction` directly (test mocks). Low risk — only internal tests use this interface.
- **`insert + insert` edge case**: If someone calls `enqueueChange("insert")` twice for the same row, the CASE preserves `"insert"` (correct) but the `id` and `scopeId` are from the original entry (also correct — it's the same pending row).
- **Future `delete` support**: When `"delete"` is added to `LocalChangeOperation`, the CASE will need extension. The Rust coalescing for `insert + delete` returns `None` (remove from push), which SQL `ON CONFLICT DO UPDATE` cannot express — it can only update, not delete. This will require either a `DELETE FROM sync_outbox` path or setting `synced_at` to effectively remove the entry from the pending index. This is a problem for the delete-support change, not this one.
