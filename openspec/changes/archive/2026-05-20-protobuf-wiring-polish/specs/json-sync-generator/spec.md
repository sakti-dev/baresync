## MODIFIED Requirements

### Requirement: Sync contract generation

The `packages/baresync/src/generator/index.ts` module SHALL export `generateSyncArtifacts(contract)` that accepts a `SyncContract` and writes the contract outputs for the selected encoding.

The generator SHALL continue writing `sync-contract.json` and table-order constants.
When the contract encoding is `"protobuf"`, the generator SHALL also emit protobuf-aware metadata needed to preserve field-number stability across regenerations, including row field numbers, table wrapper field numbers, and protobuf scalar types derived from the reflected Drizzle schema.
The protobuf generator workspace SHALL be config-driven so generated TS and Rust runtime artifacts can target explicit output directories.

#### Scenario: Generate contract from valid schema

- **WHEN** `generateSyncArtifacts` is called with a contract containing categories and products tables where products has a FK to categories
- **THEN** a `sync-contract.json` is written with `upsertOrder: ["categories", "products"]` and `deleteOrder: ["products", "categories"]`

#### Scenario: Generated table order constants are valid TypeScript

- **WHEN** the generated TypeScript order file is imported
- **THEN** `SYNC_UPSERT_ORDER` is `["categories", "products"] as const` and `SYNC_DELETE_ORDER` is `["products", "categories"] as const`

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

### Requirement: Protobuf runtime artifacts are generated from workspace config

The protobuf generator workspace SHALL emit generated runtime artifacts for both TypeScript and Rust from the same protobuf metadata.
The workspace config SHALL define the output paths for those artifacts, and regeneration SHALL be deterministic.

#### Scenario: Protobuf runtime artifacts are generated to configured paths

- **WHEN** the protobuf generator workspace is executed for a protobuf contract
- **THEN** the configured TypeScript runtime files SHALL be written to the TypeScript output directory
- **AND** the configured Rust runtime files SHALL be written to the Rust output directory
- **AND** the generated artifacts SHALL be derived from the same reflected Drizzle schema and protobuf metadata
