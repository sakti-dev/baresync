## Purpose

TBD. Generated protobuf runtime artifacts for Baresync workspaces.

## Requirements

### Requirement: Paired protobuf sync config helper

The `packages/baresync/src/generator` public API SHALL export `defineProtobufSyncConfig(input)` for protobuf workspace generation from paired local and API synced schema modules.

The input SHALL include the same paired schema fields as `defineSyncConfig(...)`:

- `packageName`
- `localSyncedSchema`
- `apiSyncedSchema`
- `tables`
- Optional `limits`

The input SHALL also include protobuf workspace output settings:

- `outputDir`
- `outputs`

The helper SHALL force the generated contract encoding to `"protobuf"` and return a `ProtobufWorkspaceConfig`.

#### Scenario: Protobuf config builds workspace config

- **WHEN** `defineProtobufSyncConfig` is called with matching local/API synced schemas and protobuf output paths
- **THEN** it returns a `ProtobufWorkspaceConfig`
- **AND** the returned contract uses `encoding: "protobuf"`
- **AND** the returned config can be passed to `generateProtobufWorkspaceArtifacts`

#### Scenario: Protobuf config uses paired schema validation

- **WHEN** `defineProtobufSyncConfig` is called with unexpected local/API schema drift
- **THEN** it fails with the same paired schema validation behavior as `defineSyncConfig`

### Requirement: Protobuf generator workspace config

The repository SHALL define a protobuf generator workspace configuration module that declares the protobuf contract source, the output directories for generated TypeScript runtime files, and the output directories for generated Rust runtime files.
The workspace config SHALL be the canonical place that maps reflected Drizzle schema metadata to protobuf runtime output locations.

#### Scenario: Generator workspace config declares output paths

- **WHEN** the protobuf generator workspace config is read
- **THEN** it SHALL expose the contract source and explicit output paths for the generated protobuf artifacts
- **AND** the output paths SHALL be stable and version-controlled

### Requirement: Generated protobuf runtime artifacts

The protobuf generator workspace SHALL emit generated runtime artifacts for both TypeScript and Rust from the same reflected schema and protobuf field metadata.
The generated TypeScript runtime SHALL provide the protobuf message encode/decode surface used by the JS server path, including push, pull, and status request/response bodies.
The generated Rust runtime SHALL provide the protobuf message encode/decode surface used by `baresync-core` and `tauri-plugin-baresync`.

#### Scenario: TypeScript and Rust runtime artifacts come from the same schema

- **WHEN** a protobuf contract is generated
- **THEN** the TypeScript runtime artifacts and Rust runtime artifacts SHALL describe the same message shapes and field numbers
- **AND** neither runtime SHALL embed JSON-string row payloads inside protobuf envelopes

#### Scenario: TypeScript runtime supports status messages

- **WHEN** the generated TypeScript runtime is used to encode and decode a status request and status response
- **THEN** the decoded status request SHALL contain `scopeId` and `cursor`
- **AND** the decoded status response SHALL contain `changedTables`, `hasChanges`, `cursor`, and `serverTime`

### Requirement: Regeneration drift detection

The protobuf generator workspace SHALL support drift checks that compare the checked-in generated TypeScript and Rust runtime artifacts against freshly generated output.

#### Scenario: Generated output drift fails verification

- **WHEN** regenerated protobuf artifacts differ from the checked-in runtime files
- **THEN** drift verification SHALL fail and identify the changed output

### Requirement: Shared sync config entrypoint for protobuf

Protobuf workspace generation SHALL support config modules that export `protobufSyncGeneratorConfig` from `sync.config.ts`.

#### Scenario: Protobuf config lives beside JSON config

- **WHEN** a package has a `sync.config.ts` file
- **THEN** that file can export both `syncGeneratorConfig` and `protobufSyncGeneratorConfig`
- **AND** both configs use the same local/API synced schema modules

#### Scenario: No sync-proto config required

- **WHEN** protobuf generation is configured through `protobufSyncGeneratorConfig`
- **THEN** consumers do not need a separate `sync-proto.config.ts` file
