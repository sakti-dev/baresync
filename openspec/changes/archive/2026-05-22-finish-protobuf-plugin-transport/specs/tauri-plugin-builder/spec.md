## ADDED Requirements

### Requirement: Protobuf encoding requires explicit transport

The Tauri plugin builder SHALL reject or fail setup for `encoding: "protobuf"` when no explicit sync HTTP transport has been configured.

The failure SHALL be actionable and explain that protobuf sync requires a schema-specific generated protobuf transport. JSON encoding SHALL continue to use `JsonHttpTransport` by default when no explicit transport is provided.

#### Scenario: Protobuf encoding without transport fails

- **WHEN** a consumer registers the plugin with `.encoding("protobuf")` and does not configure `.transport(...)`
- **THEN** plugin build or setup SHALL fail before sync commands can send network requests
- **AND** the error message SHALL tell the consumer to pass the generated protobuf transport

#### Scenario: JSON encoding keeps default transport

- **WHEN** a consumer registers the plugin with `.encoding("json")` or omits encoding
- **THEN** the plugin SHALL use the default JSON transport unless a custom transport is explicitly configured

#### Scenario: Protobuf encoding with generated transport starts

- **WHEN** a consumer registers the plugin with `.encoding("protobuf")` and passes the generated protobuf transport to `.transport(...)`
- **THEN** plugin setup SHALL complete with that transport in the managed sync configuration

### Requirement: Protobuf plugin registration contract

The Tauri plugin builder integration SHALL document and test the public protobuf registration pattern for consumer apps.

The documented pattern SHALL include:

- Generated Rust protobuf module import
- `prost` dependency requirement
- `.encoding("protobuf")`
- `.transport(...)` using the generated protobuf transport type or factory
- Existing required DB path, migrations, contract table metadata, API URL, and limits

#### Scenario: Public docs show complete protobuf plugin wiring

- **WHEN** a consumer reads protobuf or plugin registration guidance
- **THEN** the guidance SHALL show plugin setup that includes the generated protobuf transport, not only `.encoding("protobuf")`

#### Scenario: Protobuf docs distinguish encoding from transport

- **WHEN** a consumer reads protobuf guidance
- **THEN** it SHALL state that `encoding: "protobuf"` alone does not provide schema-specific protobuf HTTP encoding unless the generated transport is wired

### Requirement: Transport mismatch diagnostics

The plugin integration SHALL provide actionable diagnostics for common protobuf transport mismatches.

#### Scenario: Protobuf server receives JSON due to bad wiring

- **WHEN** a consumer reports protobuf mode failing because the server receives JSON content
- **THEN** the troubleshooting guidance SHALL direct them to verify the generated transport import, `.transport(...)` builder call, content type, generated artifact freshness, and server handler `protobufSchema`

#### Scenario: Generated transport decode failure is diagnosable

- **WHEN** the generated protobuf transport fails to decode a server response
- **THEN** the surfaced error SHALL identify the sync request kind and that protobuf response decoding failed
