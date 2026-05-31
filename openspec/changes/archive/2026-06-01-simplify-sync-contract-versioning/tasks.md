## 1. Generator Core — Remove packageName

- [x] 1.1 Write failing test: `defineSyncConfig` called without `packageName` returns valid config
- [x] 1.2 Write failing test: generated `sync-contract.json` does not contain `packageName`
- [x] 1.3 Write failing test: generated `sync-contract.manifest.json` does not contain `packageName`
- [x] 1.4 Remove `packageName` from `SyncContract` interface in `schema/contract.ts`
- [x] 1.5 Remove `packageName` from `defineSyncContract()` and `syncSchema()` in `schema/contract.ts`
- [x] 1.6 Remove `packageName` from `PairedSyncConfigInput` and `defineSyncConfig()` in `generator/config.ts`
- [x] 1.7 Remove `packageName` from `SyncManifest` interface and `writeManifest()` in `generator/manifest.ts`
- [x] 1.8 Remove `packageName` from `writeSyncContractJson()` in `generator/outputs.ts`
- [x] 1.9 Update all generator tests to remove `packageName` from inputs and assertions

## 2. Generator Core — ISO date contractVersion

- [x] 2.1 Write failing test: `sync-contract.manifest.json` `contractVersion` is a `YYYY-MM-DD` date string
- [x] 2.2 Write failing test: `sync-contract.json` `version` is a `YYYY-MM-DD` date string
- [x] 2.3 Update `SyncManifest.contractVersion` type from `number` to `string` in `generator/manifest.ts`
- [x] 2.4 Update `writeManifest()` to use `new Date().toISOString().slice(0, 10)` as `contractVersion`
- [x] 2.5 Update `writeSyncContractJson()` to use same date string as `version`
- [x] 2.6 Update manifest test assertions for date-string `contractVersion`

## 3. Generator Core — Dated output directory

- [x] 3.1 Write failing test: `generateSyncArtifacts` with `outputDir: "./generated"` writes to `./generated/<YYYY-MM-DD>/` subdirectory
- [x] 3.2 Write failing test: same-day regeneration overwrites existing dated directory
- [x] 3.3 Write failing test: different-day generation creates new directory without touching old one
- [x] 3.4 Update `generateSyncArtifacts` to compute dated subdirectory from `outputDir` + current date
- [x] 3.5 Update `writeManifest`, `writeSyncContractJson`, `writeTableOrderConstants` callers to pass dated path
- [x] 3.6 Update existing generator tests for new output directory structure

## 4. Generator Core — Schema snapshot

- [x] 4.1 Write failing test: generation copies `api-synced-schema.ts` source into dated output directory
- [x] 4.2 Write failing test: generation copies `local-synced-schema.ts` source into dated output directory
- [x] 4.3 Write failing test: re-running generation after schema edit does not modify old snapshot
- [x] 4.4 Add `schemaSourceDir` optional field to `PairedSyncConfigInput` in `generator/config.ts`
- [x] 4.5 Add schema file copy step to generator pipeline (copy from `schemaSourceDir` or resolve from config)
- [x] 4.6 Update generator tests to verify schema snapshots

## 5. Inventory Example — Update constants and config

- [x] 5.1 Write failing test: `constants.ts` exports `SYNC_SCOPE` and does not export `INVENTORY_SCOPE_ID` or `INVENTORY_PACKAGE_NAME`
- [x] 5.2 Update `constants.ts`: rename `INVENTORY_SCOPE_ID` to `SYNC_SCOPE`, remove `INVENTORY_PACKAGE_NAME`
- [x] 5.3 Update `sync.config.ts`: remove `packageName` import and field, add `schemaSourceDir` if needed
- [x] 5.4 Update `apps/app/src/hooks/useBaresyncQuery.tsx`: import `SYNC_SCOPE` instead of `INVENTORY_SCOPE_ID`
- [x] 5.5 Update `apps/app/src/components/SeedPanel.tsx`: import `SYNC_SCOPE` instead of `INVENTORY_SCOPE_ID`

## 6. Inventory Example — Versioned server organization

- [x] 6.1 Create `apps/server/src/v1/routes.ts`: move route handler setup from `index.ts`, import from `generated/` dated path
- [x] 6.2 Create `apps/server/src/db/v1/sync-repository.ts`: move from `db/drizzle-helper/sync-repository.ts`, import schemas from generated snapshot
- [x] 6.3 Update `apps/server/src/index.ts`: register routes under `/api/v1/` prefix, keep shared `db/client.ts` and `resolveScope`
- [x] 6.4 Update client app API path config to use `/api/v1/sync/...` endpoints
- [x] 6.5 Keep `db/drizzle-helper/` as reference (don't delete yet) or remove if redundant

## 7. Inventory Example — Regenerate contract output

- [x] 7.1 Delete old `packages/sync-contract/generated/` contents
- [x] 7.2 Run `bunx baresync generate` to produce new dated output with schema snapshots
- [x] 7.3 Verify generated `sync-contract.manifest.json` has date `contractVersion` and no `packageName`
- [x] 7.4 Verify generated directory contains frozen `api-synced-schema.ts` and `local-synced-schema.ts`

## 8. Scaffold Templates

- [x] 8.1 Update sync-contract scaffold templates: remove `packageName`, add `schemaSourceDir`, rename scope constant
- [x] 8.2 Update server scaffold template to use versioned route organization (`/api/v1/`)
- [x] 8.3 Update scaffold test fixtures for new contract structure

## 9. Lint, Typecheck, and Verify

- [x] 9.1 Run `bun x ultracite check` and fix any issues
- [x] 9.2 Run typecheck script and fix any type errors
- [x] 9.3 Run all baresync tests and create-baresync tests
- [x] 9.4 Run `bunx baresync generate` in inventory example and verify full output
