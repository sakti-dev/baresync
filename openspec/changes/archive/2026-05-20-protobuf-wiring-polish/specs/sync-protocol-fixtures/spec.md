## ADDED Requirements

### Requirement: Canonical JSON fixtures drive protobuf parity

The `packages/baresync/fixtures/sync/` fixture set SHALL remain canonical JSON.
For every sync fixture that represents request or response payloads, the test suite SHALL be able to derive an equivalent protobuf encode/decode check from the same logical payload.

#### Scenario: Category-product push fixture has protobuf parity coverage

- **WHEN** the category-product push fixture is used in a protobuf path
- **THEN** the decoded logical payload SHALL match the canonical JSON fixture payload
- **AND** the protobuf path SHALL preserve the same table contents and row identities
- **AND** the protobuf path SHALL not serialize row payloads as JSON strings inside protobuf fields

#### Scenario: Payload-too-large fixture remains canonical

- **WHEN** the payload-too-large fixture is evaluated
- **THEN** the canonical JSON fixture SHALL remain the source of truth for size and split-retry tests
- **AND** protobuf coverage, if present, SHALL be derived from the same logical payload

### Requirement: Protobuf parity checks compare normalized data

Protobuf parity checks SHALL compare normalized decoded payloads rather than raw binary blobs, except when the test is explicitly validating request hashing or wire-size behavior.

#### Scenario: Normalized parity comparison succeeds

- **WHEN** a JSON fixture and its protobuf equivalent are decoded
- **THEN** the normalized payloads SHALL be equivalent

#### Scenario: Wire-size tests may inspect raw bytes

- **WHEN** a test is checking request hash or wire-size behavior
- **THEN** the test MAY compare raw encoded bytes directly
