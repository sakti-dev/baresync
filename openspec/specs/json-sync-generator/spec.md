## Purpose

JSON-first sync config generation, paired local/API schema validation, and CLI discovery for Baresync contracts.

## Requirements

### Requirement: JSON sync contract generation

The `packages/baresync/src/generator/index.ts` module SHALL export `generateSyncArtifacts(contract)` that accepts a `SyncContract` and writes the following output files:

1. A `sync-contract.json` file containing the contract metadata
2. A TypeScript file exporting `SYNC_UPSERT_ORDER` and `SYNC_DELETE_ORDER` as const arrays

#### Scenario: Generate contract from valid schema

- **WHEN** `generateSyncArtifacts` is called with a contract containing categories and products tables where products has a FK to categories
- **THEN** a `sync-contract.json` is written with `upsertOrder: ["categories", "products"]` and `deleteOrder: ["products", "categories"]`

#### Scenario: Generated table order constants are valid TypeScript

- **WHEN** the generated TypeScript order file is imported
- **THEN** `SYNC_UPSERT_ORDER` is `["categories", "products"] as const` and `SYNC_DELETE_ORDER` is `["products", "categories"] as const`

### Requirement: FK-derived table order computation

The generator SHALL compute `upsertOrder` (parent before child) and `deleteOrder` (child before parent) from Drizzle foreign-key metadata using topological sort.

#### Scenario: Linear FK chain produces correct order

- **WHEN** a schema has merchants → categories → products FK chain
- **THEN** `upsertOrder` is `["merchants", "categories", "products"]` and `deleteOrder` is `["products", "categories", "merchants"]`

#### Scenario: Nullable FK to non-synced table is ignored

- **WHEN** a synced table has a nullable FK to a non-synced table
- **THEN** generation succeeds without error and the non-synced table is not in the order

#### Scenario: Required FK to non-synced table fails generation

- **WHEN** a synced table has a required (NOT NULL) FK to a non-synced table
- **THEN** generation fails with an error naming both tables and stating the FK points outside synced tables

#### Scenario: FK cycle fails generation

- **WHEN** synced tables form a FK cycle
- **THEN** generation fails with an error identifying the cycle

### Requirement: JSON contract file schema

The generated `sync-contract.json` SHALL contain:

- `version`: contract version number (starts at 1)
- `generatorVersion`: the baresync generator version
- `encoding`: `"json"`
- `packageName`: from the contract definition
- `upsertOrder`: array of table names
- `deleteOrder`: array of table names (reverse of upsertOrder)
- `tables`: object keyed by table name, each containing:
  - `columns`: array of column names included in sync
  - `scope`: object with `field` name
  - `localOnlyColumns`: array of excluded local column names
  - `serverOnlyColumns`: array of excluded server column names
- `limits`: object with `maxPushBytes` and `maxPushRows`

#### Scenario: Contract JSON is valid and parseable

- **WHEN** the generated `sync-contract.json` is parsed
- **THEN** all fields above are present and match the input contract definition

### Requirement: CLI generate command

The `packages/baresync/src/cli.ts` module SHALL support `baresync generate` which reads a sync contract configuration and generates artifacts.

The command SHALL support these config path sources, in precedence order:

1. `--config <path>`
2. Positional config path
3. Auto-discovered config in the current working directory

When auto-discovering config, the command SHALL search the current working directory for:

- `sync.config.ts`
- `sync.config.mts`
- `sync.config.js`
- `sync.config.mjs`

The command SHALL recognize and generate every supported config export in the loaded module:

- `syncGeneratorConfig`
- `protobufSyncGeneratorConfig`
- recognized default export
- legacy `contract` export

#### Scenario: CLI generate produces artifacts

- **WHEN** `bun packages/baresync/src/cli.ts generate` is run with a valid contract configuration
- **THEN** the generator output files are written to the configured output directory

#### Scenario: CLI generate accepts generator config exports

- **WHEN** `baresync generate` loads a config module that exports `syncGeneratorConfig`
- **THEN** the generator output files are written to the config output directory unless the CLI output option overrides it

#### Scenario: CLI generate discovers sync config

- **WHEN** `baresync generate` is run without a config path from a directory containing `sync.config.ts`
- **THEN** the CLI loads that config file
- **AND** it generates the recognized config exports from that file

#### Scenario: CLI generate supports config flag

- **WHEN** `baresync generate --config ./custom-sync.config.ts` is run
- **THEN** the CLI loads `./custom-sync.config.ts`
- **AND** it does not attempt auto-discovery

#### Scenario: CLI generate runs JSON and protobuf configs

- **WHEN** a config module exports both `syncGeneratorConfig` and `protobufSyncGeneratorConfig`
- **THEN** `baresync generate` runs JSON artifact generation for `syncGeneratorConfig`
- **AND** it runs protobuf workspace generation for `protobufSyncGeneratorConfig`

#### Scenario: Missing config shows searched paths

- **WHEN** `baresync generate` is run without a config path from a directory with no supported config file
- **THEN** the CLI fails with an error that names the current working directory and the config filenames it searched

### Requirement: Protobuf-aware contract generation

The `packages/baresync/src/generator/index.ts` module SHALL preserve protobuf encoding metadata when a `SyncContract` uses `encoding: "protobuf"`.
The generator SHALL emit protobuf-aware metadata needed to preserve field-number stability across regenerations, including row field numbers, table wrapper field numbers, and protobuf scalar types derived from the reflected Drizzle schema.
The protobuf generator workspace SHALL be config-driven so generated TypeScript and Rust runtime artifacts can target explicit output directories.

#### Scenario: Protobuf contract preserves encoding metadata

- **WHEN** `generateSyncArtifacts` is called with a contract whose encoding is `protobuf`
- **THEN** the generated metadata SHALL preserve `encoding: "protobuf"`
- **AND** protobuf field-number assignments SHALL remain stable across regenerations unless the schema intentionally changes
- **AND** the emitted metadata SHALL be sufficient to encode and decode typed protobuf row messages without serializing row data as JSON text
- **AND** the generator workspace SHALL have explicit output paths for generated protobuf runtime files

### Requirement: JSON and protobuf share one reflected contract

The generator SHALL derive JSON and protobuf outputs from the same reflected schema and the same table-order computation.
It SHALL not require consumers to maintain separate contract definitions for the two encodings.

#### Scenario: Same reflected schema drives both encodings

- **WHEN** the same Drizzle schema is generated for JSON and protobuf contracts
- **THEN** both outputs SHALL reflect the same tables, scope metadata, and table order
- **AND** any protobuf-specific metadata SHALL be derived from that same source

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
