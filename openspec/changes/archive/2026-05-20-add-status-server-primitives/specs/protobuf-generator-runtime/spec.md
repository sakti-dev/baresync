## MODIFIED Requirements

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
