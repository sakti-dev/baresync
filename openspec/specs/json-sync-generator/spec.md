## ADDED Requirements

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

#### Scenario: CLI generate produces artifacts

- **WHEN** `bun packages/baresync/src/cli.ts generate` is run with a valid contract configuration
- **THEN** the generator output files are written to the configured output directory

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
