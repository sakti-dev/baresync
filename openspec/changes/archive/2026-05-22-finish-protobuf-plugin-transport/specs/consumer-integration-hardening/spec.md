## ADDED Requirements

### Requirement: Consumer protobuf integration checklist

The public consumer integration guidance SHALL include a protobuf-specific checklist for apps that choose protobuf transport.

The checklist SHALL cover:

- `defineProtobufSyncConfig(...)` usage
- Generated TypeScript protobuf schema/runtime outputs
- Generated Rust protobuf output and transport import
- `prost` dependency setup
- Tauri plugin `.encoding("protobuf")`
- Tauri plugin `.transport(...)` using generated protobuf transport
- Server handlers configured with `encoding: "protobuf"` and `protobufSchema`
- Verification that sync HTTP requests use `Content-Type: application/x-protobuf`
- Drift check or regeneration command for protobuf artifacts

#### Scenario: Protobuf checklist prevents encoding-only setup

- **WHEN** a consumer follows protobuf integration guidance
- **THEN** the guidance SHALL NOT present `.encoding("protobuf")` as sufficient by itself
- **AND** it SHALL require generated transport wiring before claiming app sync uses protobuf

#### Scenario: Protobuf checklist includes server and app sides

- **WHEN** a consumer validates protobuf integration
- **THEN** the checklist SHALL include both the server decode/encode setup and the Tauri app generated transport setup

### Requirement: Protobuf integration tests for consumer apps

The public testing guidance SHALL describe how consumer apps can test protobuf integration safely without testing Baresync internals for their own sake.

#### Scenario: Consumer protobuf test asserts app behavior

- **WHEN** a consumer writes an E2E or smoke test for a protobuf-enabled app
- **THEN** the guidance SHALL direct them to assert app-visible sync behavior, backend state, clean local outbox state, and protobuf request evidence rather than only asserting that protobuf helpers encode and decode

#### Scenario: Consumer protobuf test starts with host checks

- **WHEN** a consumer prepares protobuf device smoke validation
- **THEN** the guidance SHALL direct them to run generator drift checks, server contract checks, and plugin registration/preflight checks before desktop or Android smoke tests

### Requirement: Protobuf troubleshooting guidance

The public troubleshooting guidance SHALL include protobuf-specific failure diagnosis for app integrations.

#### Scenario: Server receives JSON in protobuf mode

- **WHEN** a protobuf integration fails because the server receives JSON or rejects content type
- **THEN** the guidance SHALL identify missing generated transport wiring as the first thing to check

#### Scenario: Protobuf decode failure after schema change

- **WHEN** protobuf decode fails after a schema or generated artifact change
- **THEN** the guidance SHALL direct the consumer to check artifact drift, regenerated Rust and TypeScript outputs, protobuf field-number stability, and matching server/client deployed versions
