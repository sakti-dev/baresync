## MODIFIED Requirements

### Requirement: Paired local and API sync config

The `packages/baresync/src/generator` public API SHALL export `defineSyncConfig(input)` for JSON-first sync generation from paired local and API synced schema modules.

The input SHALL include:

- `outputDir`: generated artifact output directory (parent of dated subdirectories)
- `localSyncedSchema`: object containing local-side replicated Drizzle tables
- `apiSyncedSchema`: object containing API-side replicated Drizzle tables
- `tables`: object keyed by table export name, with per-table sync settings
- Optional `limits`
- Optional `schemaSourceDir`: directory containing the source schema files to snapshot into the generated output

The `packageName` field SHALL NOT be accepted by `defineSyncConfig`.

Each `tables` key SHALL refer to a table present in both `localSyncedSchema` and `apiSyncedSchema`.

#### Scenario: Paired config builds a generator config without packageName

- **WHEN** `defineSyncConfig` is called with matching `localSyncedSchema`, `apiSyncedSchema`, and `tables` entries for `locations`, `items`, and `stockCounts`
- **THEN** it returns a `GeneratorConfig` accepted by `generateSyncArtifacts`
- **AND** the config does not contain a `packageName` field

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

### Requirement: JSON contract file schema

The generated `sync-contract.json` SHALL contain:

- `contractVersion`: ISO date string (`YYYY-MM-DD`) from generation time
- `generatorVersion`: the baresync generator version
- `encoding`: `"json"`
- `upsertOrder`: array of table names
- `deleteOrder`: array of table names (reverse of upsertOrder)
- `tables`: object keyed by table name, each containing:
  - `columns`: array of column names included in sync
  - `scope`: object with `field` name
  - `localOnlyColumns`: array of excluded local column names
  - `serverOnlyColumns`: array of excluded server column names
- `limits`: object with `maxPushBytes` and `maxPushRows`

The `packageName` field SHALL NOT appear in the generated output.

#### Scenario: Contract JSON is valid and parseable

- **WHEN** the generated `sync-contract.json` is parsed
- **THEN** all fields above are present and match the input contract definition
- **AND** no `packageName` field exists in the output

## REMOVED Requirements

### Requirement: Contract version integer
**Reason**: Replaced by ISO date string for human-readability and stateless generation.
**Migration**: `contractVersion` is now a `YYYY-MM-DD` date string instead of an integer. Any code comparing or displaying contract version must handle string format.
