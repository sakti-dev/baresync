## ADDED Requirements

### Requirement: Protobuf generator workspace config

The repository SHALL define a protobuf generator workspace configuration module that declares the protobuf contract source, the output directories for generated TypeScript runtime files, and the output directories for generated Rust runtime files.
The workspace config SHALL be the canonical place that maps reflected Drizzle schema metadata to protobuf runtime output locations.

#### Scenario: Generator workspace config declares output paths

- **WHEN** the protobuf generator workspace config is read
- **THEN** it SHALL expose the contract source and explicit output paths for the generated protobuf artifacts
- **AND** the output paths SHALL be stable and version-controlled

### Requirement: Generated protobuf runtime artifacts

The protobuf generator workspace SHALL emit generated runtime artifacts for both TypeScript and Rust from the same reflected schema and protobuf field metadata.
The generated TypeScript runtime SHALL provide the protobuf message encode/decode surface used by the JS server path.
The generated Rust runtime SHALL provide the protobuf message encode/decode surface used by `baresync-core` and `tauri-plugin-baresync`.

#### Scenario: TypeScript and Rust runtime artifacts come from the same schema

- **WHEN** a protobuf contract is generated
- **THEN** the TypeScript runtime artifacts and Rust runtime artifacts SHALL describe the same message shapes and field numbers
- **AND** neither runtime SHALL embed JSON-string row payloads inside protobuf envelopes

### Requirement: Regeneration drift detection

The protobuf generator workspace SHALL support drift checks that compare the checked-in generated TypeScript and Rust runtime artifacts against freshly generated output.

#### Scenario: Generated output drift fails verification

- **WHEN** regenerated protobuf artifacts differ from the checked-in runtime files
- **THEN** drift verification SHALL fail and identify the changed output
