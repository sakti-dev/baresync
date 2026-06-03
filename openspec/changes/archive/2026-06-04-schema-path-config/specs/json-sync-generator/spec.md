## MODIFIED Requirements

### Requirement: Paired local and API sync config

The `packages/baresync/src/generator` public API SHALL export `defineSyncConfig(input)` for JSON-first sync generation from paired local and API synced schema file paths.

The input SHALL include:

- `outputDir`: generated artifact output directory (parent of dated subdirectories)
- `localSyncedSchema`: path to the local-side synced schema module
- `apiSyncedSchema`: path to the API-side synced schema module
- `tables`: object keyed by table export name, with per-table sync settings
- Optional `limits`

The `packageName` field SHALL NOT be accepted by `defineSyncConfig`. The `encoding` field SHALL NOT be accepted by `defineSyncConfig`.

The generator SHALL resolve both schema paths, load the schema modules they point to, and validate that each `tables` key exists in both loaded modules at runtime.

#### Scenario: Paired config builds a generator config without packageName or encoding

- **WHEN** `defineSyncConfig` is called with matching `localSyncedSchema`, `apiSyncedSchema`, and `tables` entries for `locations`, `items`, and `stockCounts`
- **THEN** it returns a `GeneratorConfig` accepted by `generateSyncArtifacts`
- **AND** the config does not contain a `packageName` field
- **AND** the config does not contain an `encoding` field

#### Scenario: Missing API table fails validation

- **WHEN** `defineSyncConfig` is called with a table key that exists in `localSyncedSchema` but not in `apiSyncedSchema`
- **THEN** it throws a descriptive error naming the missing API-side table

#### Scenario: Missing local table fails validation

- **WHEN** `defineSyncConfig` is called with a table key that exists in `apiSyncedSchema` but not in `localSyncedSchema`
- **THEN** it throws a descriptive error naming the missing local-side table
