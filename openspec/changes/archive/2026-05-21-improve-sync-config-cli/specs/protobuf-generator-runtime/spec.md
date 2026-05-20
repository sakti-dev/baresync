## ADDED Requirements

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

### Requirement: Shared sync config entrypoint for protobuf

Protobuf workspace generation SHALL support config modules that export `protobufSyncGeneratorConfig` from `sync.config.ts`.

#### Scenario: Protobuf config lives beside JSON config

- **WHEN** a package has a `sync.config.ts` file
- **THEN** that file can export both `syncGeneratorConfig` and `protobufSyncGeneratorConfig`
- **AND** both configs use the same local/API synced schema modules

#### Scenario: No sync-proto config required

- **WHEN** protobuf generation is configured through `protobufSyncGeneratorConfig`
- **THEN** consumers do not need a separate `sync-proto.config.ts` file
