## Why

First-time clients can complete a baseline pull, apply remote rows, and still remain permanently uninitialized because `baresync-core` only stores pull response cursors for stored-cursor pulls, not baseline pulls. This causes repeated `FullResync` on every app open, stuck `needs_baseline_sync=true` state, and expensive full-table API reads despite successful sync work.

The current server contract also allows an empty cursor when a scope has no remote rows. That makes empty remote datasets indistinguishable from failed or never-completed baseline syncs, so baresync needs a stronger infrastructure invariant: successful server responses must always return a non-empty server-owned watermark cursor.

## What Changes

- Server pull/status responses SHALL always return a non-empty cursor for successful responses.
- Empty remote datasets SHALL return a synthetic server watermark cursor instead of `""`.
- The public Drizzle repository helper SHALL format synthetic watermark cursors when no latest synced row exists.
- The Rust engine SHALL store a non-empty baseline pull response cursor after a successful initial baseline pull when no cursor exists yet.
- Reconciliation baseline pulls for server-wins rejected tables SHALL continue to preserve the existing cursor and SHALL NOT overwrite it.
- Initial baseline syncs triggered by `needs_baseline_sync=true` SHALL pull all contract tables and SHALL NOT filter by `/status.changedTables`.
- Empty stored cursor values SHALL remain treated as uninitialized/invalid state and SHALL continue to trigger baseline sync.
- Tests SHALL be written first and each new behavior SHALL have a red/green implementation path.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `server-push-primitives`: Cursor helper requirements change to include a synthetic server watermark cursor formatter that preserves the existing `sync:<timestamp>:<tableName>:<rowId>` wire shape.
- `server-drizzle-repository-helper`: Pull/status repository responses change from "empty cursor when no rows exist" to "non-empty synthetic watermark cursor when no rows exist".
- `sync-pull-client`: Pull response cursor semantics change to require successful responses to provide a non-empty cursor, and baseline cursor storage changes to allow initialization after successful first baseline.
- `sync-engine-completion`: Initial baseline orchestration changes to pull all contract tables regardless of status `changedTables`; reconciliation baseline behavior remains filtered to rejected tables and cursor-preserving.

## Impact

- Affected Rust code:
  - `crates/baresync-core/src/pull.rs`
  - `crates/baresync-core/src/engine.rs`
  - `crates/baresync-core/tests/simulation.rs`
- Affected TypeScript server code:
  - `packages/baresync/src/server/service.ts`
  - `packages/baresync/src/server/drizzle.ts`
  - `packages/baresync/src/server/__test__/service-primitives.test.ts`
  - `packages/baresync/src/server/__test__/drizzle.test.ts`
- Affected example code/tests where cursor assumptions are asserted:
  - `examples/inventory-json-polling/apps/server/src/db/v1/primitive/sync-repository.ts`
  - `examples/inventory-json-polling/apps/server/src/db/v1/drizzle-helper/sync-repository.ts`
- Affected specs:
  - `openspec/specs/server-push-primitives/spec.md`
  - `openspec/specs/server-drizzle-repository-helper/spec.md`
  - `openspec/specs/sync-pull-client/spec.md`
  - `openspec/specs/sync-engine-completion/spec.md`
- API behavior change:
  - Successful `/pull` and `/status` responses must return non-empty `cursor`.
  - The cursor remains server-owned. Clients store API cursors; clients do not invent cursors.
- Compatibility:
  - Servers that still return `cursor: ""` for successful responses will leave clients in baseline-needed state. This is intentional fail-safe behavior until servers adopt the stronger cursor contract.
