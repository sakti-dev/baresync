## 1. Schema Helpers

- [x] 1.1 Add tests for `localSyncColumns()` and `apiSyncColumns()` table integration.
- [x] 1.2 Implement `localSyncColumns()` and `apiSyncColumns()` in the schema row-state module.
- [x] 1.3 Export the helper functions from `baresync/schema` and root package entrypoints.
- [x] 1.4 Remove `localSyncRowState` and `apiSyncRowState` object exports.

## 2. Paired Config API

- [x] 2.1 Add tests for `defineSyncConfig(...)` building a valid `GeneratorConfig` from paired local/API schemas.
- [x] 2.2 Add TypeScript coverage for table key inference and unknown key rejection where practical.
- [x] 2.3 Implement typed `defineSyncConfig(...)` input types keyed by shared local/API schema exports.
- [x] 2.4 Apply default `localOnlyColumns: ["isSynced"]` and `serverOnlyColumns: ["syncUpdatedAt"]` per table.
- [x] 2.5 Validate that every configured table exists in both local and API synced schemas.
- [x] 2.6 Validate local/API column drift after excluding configured local-only and server-only columns.
- [x] 2.7 Export `defineSyncConfig(...)` from `baresync/generator` and root package entrypoints.

## 3. Generator Integration

- [x] 3.1 Ensure `generateSyncArtifacts(...)` accepts the new config object without breaking existing overloads.
- [x] 3.2 Preserve JSON contract output compatibility for existing generated artifacts.
- [x] 3.3 Add or update CLI config loading tests if the CLI needs to recognize the new config shape.

## 4. Inventory Example

- [x] 4.1 Update local synced inventory tables to use `localSyncColumns()`.
- [x] 4.2 Update API synced inventory tables to use `apiSyncColumns()`.
- [x] 4.3 Rewrite `examples/inventory/packages/sync-contract/sync.config.ts` around `defineSyncConfig(...)`, `localSyncedSchema`, and `apiSyncedSchema`.
- [x] 4.4 Regenerate inventory sync artifacts and confirm generated JSON output remains coherent.
- [x] 4.5 Update inventory README/docs snippets that show schema or sync config setup.

## 5. Verification

- [x] 5.1 Run `bun x ultracite check`.
- [x] 5.2 Run `bun run typecheck`.
- [x] 5.3 Run `bun run inventory:typecheck`.
- [x] 5.4 Run relevant package tests for schema helpers and generator behavior.
- [x] 5.5 Run `openspec validate add-paired-sync-config --strict`.
