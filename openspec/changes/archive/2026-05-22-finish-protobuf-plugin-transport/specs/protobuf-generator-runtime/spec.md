## ADDED Requirements

### Requirement: Generated Rust protobuf transport

The protobuf generator workspace SHALL emit schema-specific Rust code that implements protobuf HTTP transport for push, pull, and status sync requests.

The generated Rust transport SHALL:

- Implement or return an implementation of `baresync_core::http::SyncHttpTransport`
- Encode outbound push, pull, and status request bodies as protobuf bytes using generated prost message structs
- Send `Content-Type: application/x-protobuf` for protobuf sync requests
- Decode protobuf push, pull, and status responses into the logical `serde_json::Value` response shape expected by `baresync-core`
- Preserve the existing logical field names used by the engine, including `scopeId`, `clientId`, `idempotencyKey`, `tables`, `changedRows`, `deletedIds`, `serverTime`, `cursor`, `hasMore`, `changedTables`, and push acknowledgement fields

#### Scenario: Generated transport implements sync transport

- **WHEN** a protobuf contract is generated
- **THEN** the generated Rust protobuf output SHALL expose a concrete transport type or factory that can be passed to `tauri-plugin-baresync` as an `Arc<dyn SyncHttpTransport>`
- **AND** the generated code SHALL compile in a Tauri app crate with the documented protobuf dependencies

#### Scenario: Push request uses protobuf wire format

- **WHEN** the generated transport sends a push request
- **THEN** the HTTP request body SHALL be protobuf bytes for `SyncPushBatchRequest`
- **AND** the request SHALL use `Content-Type: application/x-protobuf`
- **AND** changed rows SHALL be encoded as generated per-table row messages, not JSON strings inside protobuf fields

#### Scenario: Pull response decodes to engine shape

- **WHEN** the generated transport receives a protobuf pull response
- **THEN** it SHALL decode `SyncPullBatchResponse`
- **AND** it SHALL return a `serde_json::Value` containing the engine's expected pull response shape with table entries, changed rows, deleted IDs, cursor, `hasMore`, and `serverTime`

#### Scenario: Status request and response use protobuf

- **WHEN** the generated transport sends a status request and receives a status response
- **THEN** it SHALL encode `SyncStatusRequest`
- **AND** it SHALL decode `SyncStatusResponse`
- **AND** the returned logical value SHALL contain `changedTables`, `hasChanges`, `cursor`, and `serverTime`

### Requirement: Generated Rust value mappers

The protobuf generator workspace SHALL emit Rust mapper functions between engine logical `serde_json::Value` rows and generated prost row structs for every synced table in the contract.

The mapper functions SHALL support the same scalar mappings as the generated protobuf schema: string, bool, int64, double, and bytes. Nullable text-like values used by sync metadata, including `deletedAt`, SHALL round-trip through the generated mapper without turning missing/null values into invalid row objects.

#### Scenario: Row values map to generated prost structs

- **WHEN** a logical row value contains supported scalar fields for a synced table
- **THEN** the generated mapper SHALL produce the corresponding generated prost row struct with matching field numbers and Rust field names

#### Scenario: Generated prost structs map to row values

- **WHEN** a generated prost row struct is decoded from a protobuf response
- **THEN** the generated mapper SHALL produce a logical row value with the public sync field names expected by the engine and JS/server contracts

#### Scenario: Unsupported row shape fails clearly

- **WHEN** a logical row value is missing a required table field or contains a value that cannot be mapped to the generated protobuf type
- **THEN** the generated transport SHALL return a `SyncError::Encoding` with the table and field context needed to diagnose the bad payload

### Requirement: Generated protobuf transport drift detection

The protobuf generator workspace SHALL include generated Rust protobuf transport code in drift detection.

#### Scenario: Rust transport drift fails verification

- **WHEN** regenerated protobuf transport code differs from the checked-in generated Rust output
- **THEN** drift verification SHALL fail and identify the changed generated output

#### Scenario: Existing protobuf runtime drift still checked

- **WHEN** regenerated TypeScript runtime, protobuf schema, contract JSON, table order, or Rust prost structs differ from checked-in outputs
- **THEN** drift verification SHALL continue to fail as before

### Requirement: Generated artifact formatting

The generator SHALL format only files that it generated. It SHALL NOT run a formatter across the consumer's project tree.

Generated TypeScript and JSON artifacts SHALL prefer the consumer project's local formatter when it is explicitly configured and installed. If no supported local formatter is available, the generator SHALL use its bundled Prettier dependency as a deterministic fallback. Generated Rust artifacts SHALL be formatted with `rustfmt` when it is available.

#### Scenario: Biome projects use local Biome for generated files

- **WHEN** a consumer project has a Biome config and a local Biome binary installed
- **THEN** the generator SHALL run Biome directly on generated TypeScript and JSON files only
- **AND** it SHALL NOT invoke project-specific wrappers such as Ultracite

#### Scenario: Projects without a supported formatter still get formatted output

- **WHEN** no supported local TypeScript/JSON formatter is configured and installed
- **THEN** the generator SHALL format generated TypeScript and JSON artifacts with the bundled Prettier fallback
- **AND** it SHALL format only generated artifact paths

#### Scenario: JSON and protobuf generator paths share formatting behavior

- **WHEN** either JSON or protobuf sync artifacts are generated
- **THEN** generated TypeScript and JSON outputs SHALL use the same generated-file-only formatting policy
