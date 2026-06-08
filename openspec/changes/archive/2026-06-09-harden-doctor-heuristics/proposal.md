## Why

`baresync doctor` currently emits five warnings per valid paired-schema table because several diagnostics are unconditional, inspect only the local side, or require configuration that the paired API cannot express. This warning noise makes the command difficult to trust and obscures real schema and performance problems.

## What Changes

- Make paired-schema diagnostics inspect the appropriate local or API Drizzle table when validating side-specific indexes.
- Emit `SYNC_INDEX_MISSING_SCOPE_WATERMARK` only when the API table actually lacks an index beginning with the configured scope column and `sync_updated_at`.
- Remove `SYNC_INDEX_MISSING_LOCAL_DIRTY` because pending changes are read from `sync_outbox`, not by scanning synced tables for dirty rows.
- Stop warning about the expected default `isSynced` local-only and `syncUpdatedAt` server-only column pair.
- Preserve the one-to-one warning for additional business columns that exist only on both sides of a paired table.
- Remove conflict and delete strategy warnings until a supported public configuration surface and runtime consumer exist.
- Add a reusable multi-table paired-schema fixture and focused regression tests for valid and invalid diagnostic combinations.
- Update diagnostic documentation to describe only checks that are actionable and implemented.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `generator-diagnostics`: Revise warning requirements so paired diagnostics use side-specific schema evidence, expected built-in column differences do not warn, and unsupported or stale heuristic warnings are removed.

## Impact

- Affected generator and CLI code:
  - `packages/baresync/src/generator/diagnostics.ts`
  - `packages/baresync/src/generator/index.ts`
  - `packages/baresync/src/cli/generator.ts`
- Affected tests:
  - `packages/baresync/src/generator/__test__/diagnostics.test.ts`
  - New multi-table paired doctor heuristic fixtures and regression tests
  - CLI diagnostics tests where warning counts or codes are asserted
- Affected documentation:
  - `apps/docs/content/docs/schema/diagnostics.mdx`
  - `apps/docs/content/docs/generator/cli.mdx`
- Public behavior:
  - Correct paired schemas will produce materially fewer warnings.
  - `SYNC_INDEX_MISSING_LOCAL_DIRTY`, `SYNC_SCHEMA_NO_CONFLICT_STRATEGY`, and `SYNC_SCHEMA_NO_DELETE_STRATEGY` will no longer be emitted.
  - `SYNC_INDEX_MISSING_SCOPE_WATERMARK` and `SYNC_SCHEMA_BATTERIES_INCLUDED_NOT_1_TO_1` remain available but become evidence-based.
