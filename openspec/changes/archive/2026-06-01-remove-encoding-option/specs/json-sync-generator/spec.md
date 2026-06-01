## MODIFIED Requirements

### Requirement: JSON contract file schema

The generated `sync-contract.json` SHALL contain:

- `contractVersion`: ISO date string (`YYYY-MM-DD`) from generation time
- `generatorVersion`: the baresync generator version
- `upsertOrder`: array of table names
- `deleteOrder`: array of table names (reverse of upsertOrder)
- `tables`: object keyed by table name, each containing:
  - `columns`: array of column names included in sync
  - `scope`: object with `field` name
  - `localOnlyColumns`: array of excluded local column names
  - `serverOnlyColumns`: array of excluded server column names
- `limits`: object with `maxPushBytes` and `maxPushRows`

The `packageName` field SHALL NOT appear in the generated output. The `encoding` field SHALL NOT appear in the generated output — JSON is the only supported wire format.

#### Scenario: Contract JSON is valid and parseable

- **WHEN** the generated `sync-contract.json` is parsed
- **THEN** all fields above are present and match the input contract definition
- **AND** no `packageName` field exists in the output
- **AND** no `encoding` field exists in the output

### Requirement: Paired local and API sync config

The `packages/baresync/src/generator` public API SHALL export `defineSyncConfig(input)` for sync generation from paired local and API synced schema modules.

The input SHALL include:

- `outputDir`: generated artifact output directory (parent of dated subdirectories)
- `localSyncedSchema`: object containing local-side replicated Drizzle tables
- `apiSyncedSchema`: object containing API-side replicated Drizzle tables
- `tables`: object keyed by table export name, with per-table sync settings
- Optional `limits`
- Optional `schemaSourceDir`: directory containing the source schema files to snapshot into the generated output

The `packageName` field SHALL NOT be accepted by `defineSyncConfig`. The `encoding` field SHALL NOT be accepted by `defineSyncConfig`.

Each `tables` key SHALL refer to a table present in both `localSyncedSchema` and `apiSyncedSchema`.

#### Scenario: Paired config builds a generator config without packageName or encoding

- **WHEN** `defineSyncConfig` is called with matching `localSyncedSchema`, `apiSyncedSchema`, and `tables` entries for `locations`, `items`, and `stockCounts`
- **THEN** it returns a `GeneratorConfig` accepted by `generateSyncArtifacts`
- **AND** the config does not contain a `packageName` field
- **AND** the config does not contain an `encoding` field

## REMOVED Requirements

### Requirement: Configurable wire encoding
**Reason**: The framework has committed to JSON as the only supported wire format. The encoding option added API surface and documentation cost for a benefit that compression at the CDN layer makes negligible.
**Migration**: Remove the `encoding: "json"` field from any `defineSyncConfig` call. The framework always serializes and deserializes JSON.
