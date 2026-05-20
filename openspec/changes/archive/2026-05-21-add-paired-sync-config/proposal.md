## Why

Baresync currently makes JSON users assemble a sync contract from only the local table view, while real applications need both local-side and API-side synced schemas to keep sync metadata, drift checks, and future generated adapters coherent. The inventory example exposed that mismatch because its schema layout wants the same local/API split used by Sakti, even when the output is JSON-first.

## What Changes

- Add an opinionated `defineSyncConfig(...)` API that accepts `localSyncedSchema`, `apiSyncedSchema`, table settings, package metadata, and output settings.
- Make the paired local/API schema view the recommended generator entrypoint for JSON-first projects.
- Keep `syncSchema(...)` and `syncedTable(...)` available as lower-level APIs.
- Add supported Drizzle column helper functions:
  - `localSyncColumns()` for `deletedAt`, `createdAt`, `updatedAt`, and `isSynced`
  - `apiSyncColumns()` for `deletedAt`, `createdAt`, `updatedAt`, and `syncUpdatedAt`
- Update the inventory example to use the paired config and column helpers.
- Add validation that paired schema tables exist on both sides and that allowed local-only/server-only column differences are explicit.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `schema-helpers`: Add supported sync column helper functions for local and API Drizzle tables.
- `json-sync-generator`: Add paired local/API sync config support for JSON artifact generation.

## Impact

- Affects the public TypeScript API exported from `baresync/schema` and `baresync/generator`.
- Affects generator config typing, validation, tests, and CLI/config loading behavior.
- Affects `examples/inventory/packages/sync-contract` schema authoring and generation setup.
- Does not remove existing lower-level contract APIs.
