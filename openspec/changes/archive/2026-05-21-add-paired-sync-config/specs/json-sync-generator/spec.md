## ADDED Requirements

### Requirement: Paired local and API sync config

The `packages/baresync/src/generator` public API SHALL export `defineSyncConfig(input)` for JSON-first sync generation from paired local and API synced schema modules.

The input SHALL include:

- `packageName`: sync package namespace
- `outputDir`: generated artifact output directory
- `localSyncedSchema`: object containing local-side replicated Drizzle tables
- `apiSyncedSchema`: object containing API-side replicated Drizzle tables
- `tables`: object keyed by table export name, with per-table sync settings
- Optional `encoding`, defaulting to `"json"`
- Optional `limits`

Each `tables` key SHALL refer to a table present in both `localSyncedSchema` and `apiSyncedSchema`.

#### Scenario: Paired config builds a generator config

- **WHEN** `defineSyncConfig` is called with matching `localSyncedSchema`, `apiSyncedSchema`, and `tables` entries for `locations`, `items`, and `stockCounts`
- **THEN** it returns a `GeneratorConfig` accepted by `generateSyncArtifacts`
- **AND** the generated contract uses the configured package name and output directory

#### Scenario: Table names are typed from paired schemas

- **WHEN** TypeScript users define `tables` for `defineSyncConfig`
- **THEN** table keys are inferred from keys shared by `localSyncedSchema` and `apiSyncedSchema`
- **AND** unknown table keys are rejected by the type checker

#### Scenario: Missing API table fails validation

- **WHEN** `defineSyncConfig` is called with a table key that exists in `localSyncedSchema` but not in `apiSyncedSchema`
- **THEN** it throws a descriptive error naming the missing API-side table

#### Scenario: Missing local table fails validation

- **WHEN** `defineSyncConfig` is called with a table key that exists in `apiSyncedSchema` but not in `localSyncedSchema`
- **THEN** it throws a descriptive error naming the missing local-side table

### Requirement: Supported local and server column differences

`defineSyncConfig` SHALL support local-only and server-only column differences for paired schemas.

By default, each table config SHALL use:

- `localOnlyColumns: ["isSynced"]`
- `serverOnlyColumns: ["syncUpdatedAt"]`

Consumers MAY override those arrays per table.

#### Scenario: Default column differences are applied

- **WHEN** a table config only specifies `scope`
- **THEN** the generated contract records `isSynced` as a local-only column
- **AND** the generated contract records `syncUpdatedAt` as a server-only column

#### Scenario: Explicit column differences override defaults

- **WHEN** a table config specifies custom `localOnlyColumns` or `serverOnlyColumns`
- **THEN** the generated contract records the explicit arrays for that table

### Requirement: Paired schema drift validation

`defineSyncConfig` SHALL validate that local and API table columns match after excluding configured local-only and server-only columns.

#### Scenario: Matching paired schemas pass validation

- **WHEN** local and API versions of a table have the same synced columns after excluding configured local-only and server-only columns
- **THEN** config creation succeeds

#### Scenario: Unexpected local-only column fails validation

- **WHEN** the local table has a column that is absent from the API table and not listed in `localOnlyColumns`
- **THEN** config creation fails with an error naming the table and unexpected local-only column

#### Scenario: Unexpected server-only column fails validation

- **WHEN** the API table has a column that is absent from the local table and not listed in `serverOnlyColumns`
- **THEN** config creation fails with an error naming the table and unexpected server-only column

### Requirement: Inventory example uses paired config

The inventory example SHALL use `defineSyncConfig` with `localSyncedSchema` and `apiSyncedSchema` as its sync generator entrypoint.

#### Scenario: Inventory config is JSON-first and paired

- **WHEN** the inventory sync contract package runs its generator
- **THEN** it imports both local and API synced schema modules
- **AND** it generates JSON artifacts through `defineSyncConfig`
- **AND** it does not require protobuf-specific config naming
