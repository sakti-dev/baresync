## Why

The sync-contract package currently owns two constants (`INVENTORY_SCOPE_ID` and `INVENTORY_PACKAGE_NAME`) that don't belong in a schema definition package. `INVENTORY_PACKAGE_NAME` is a protobuf remnant (protobuf support was dropped). `INVENTORY_SCOPE_ID` is a runtime value that should live in app code. Additionally, `packageName` is a required field in `defineSyncConfig` even though the contract identity can be derived from the generated output directory. This creates unnecessary coupling and forces every contract to carry a domain-specific namespace that serves no purpose without protobuf encoding.

## What Changes

- **BREAKING**: Remove `packageName` from `defineSyncConfig` input. Contract identity is the generated output directory path.
- **BREAKING**: Remove `packageName` from generated `sync-contract.json` and `sync-contract.manifest.json`.
- Replace `contractVersion: 1` (integer) with `contractVersion` as an ISO date string (`YYYY-MM-DD`) derived from generation time.
- Rename `INVENTORY_SCOPE_ID` to `SYNC_SCOPE` in `sync-contract/src/constants.ts` — it remains in sync-contract as a shared runtime value for both app and server.
- Remove `INVENTORY_PACKAGE_NAME` from `constants.ts` entirely.
- Update `sync.config.ts` to no longer pass `packageName`.
- Update generated output to use dated subdirectories: `generated/<YYYY-MM-DD>/` instead of flat `generated/`.
- Update inventory example imports to use `SYNC_SCOPE` instead of `INVENTORY_SCOPE_ID`.
- Update `create-baresync` scaffold templates to match new contract structure.

## Capabilities

### New Capabilities
- `dated-contract-generation`: Generator outputs to versioned dated directories and uses ISO date as contract version.

### Modified Capabilities
- `json-sync-generator`: Remove `packageName` from `defineSyncConfig`, generator config, and generated output. Replace integer `contractVersion` with ISO date.
- `inventory-example`: Rename `INVENTORY_SCOPE_ID` to `SYNC_SCOPE`, remove `INVENTORY_PACKAGE_NAME`, update imports and config.

## Impact

- `packages/baresync/src/generator/` — remove `packageName` from types and output, add dated directory generation
- `packages/baresync/src/generator/__test__/` — update generator tests
- `examples/inventory-json-polling/packages/sync-contract/` — update `sync.config.ts`, `constants.ts`, regenerate output
- `examples/inventory-json-polling/apps/app/` — update `SYNC_SCOPE` imports
- `examples/inventory-json-polling/apps/server/` — uses scope from request, minimal impact
- `packages/create-baresync/src/templates/` — update scaffold templates for new contract structure
- `openspec/specs/json-sync-generator/spec.md` — update requirements to remove `packageName`
- `openspec/specs/inventory-example/spec.md` — update requirements for `SYNC_SCOPE`
