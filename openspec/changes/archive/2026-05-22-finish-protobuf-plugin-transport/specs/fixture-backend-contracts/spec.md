## ADDED Requirements

### Requirement: Fixture backend protobuf wire evidence

The fixture backend contract tests SHALL verify protobuf mode at the HTTP wire boundary, not only by comparing decoded logical payloads.

#### Scenario: Protobuf requests use protobuf content type

- **WHEN** the backend contract test sends status, pull, or push requests in protobuf mode
- **THEN** each sync request SHALL use `Content-Type: application/x-protobuf`
- **AND** the request body SHALL be sent as protobuf bytes encoded by the generated fixture protobuf runtime

#### Scenario: Protobuf responses use protobuf content type

- **WHEN** the fixture backend responds to status, pull, or push requests in protobuf mode
- **THEN** each successful sync response SHALL use `Content-Type: application/x-protobuf`
- **AND** the response body SHALL decode with the generated fixture protobuf runtime to the expected logical payload

#### Scenario: JSON requests remain JSON

- **WHEN** the backend contract test sends status, pull, or push requests in JSON mode
- **THEN** each sync request SHALL use JSON request bodies
- **AND** each successful sync response SHALL remain JSON-decodable

### Requirement: Fixture backend rejects transport mismatch clearly

The fixture backend SHALL make transport mismatch failures diagnosable in contract tests.

#### Scenario: Protobuf backend receives invalid protobuf body

- **WHEN** the fixture backend is running in protobuf mode and receives an invalid protobuf sync request body
- **THEN** the contract test SHALL observe a non-success response or thrown request failure that identifies protobuf decode failure

#### Scenario: JSON backend receives invalid JSON body

- **WHEN** the fixture backend is running in JSON mode and receives an invalid JSON sync request body
- **THEN** the contract test SHALL observe a non-success response or thrown request failure that identifies JSON parse failure

### Requirement: Protobuf sync simulation coverage

The test suite SHALL include host-side protobuf simulation coverage that exercises meaningful sync semantics through protobuf encode/decode boundaries, not only happy-path device smoke tests or isolated encode/decode parity checks.

The protobuf simulation coverage SHALL run without requiring desktop, Android, adb, or Tauri runtime prerequisites. Device E2E tests SHALL remain smoke coverage for generated transport wiring, while host-side protobuf simulation SHALL carry the deeper sync behavior matrix.

#### Scenario: Protobuf push simulation preserves sync semantics

- **WHEN** a protobuf push request includes changed rows, deleted IDs, nullable text inputs, boolean fields, integer fields, and tables in non-contract order
- **THEN** the simulation SHALL decode the protobuf request into the logical server shape
- **AND** validate payload limits using the decoded request byte length and row count
- **AND** reorder changes into contract upsert order
- **AND** preserve changed rows and deleted IDs per table
- **AND** tolerate nullable text inputs without producing invalid row objects, while delete semantics remain represented by `deletedIds`
- **AND** encode the push acknowledgement as protobuf
- **AND** decode that response back to the expected logical acknowledgement

#### Scenario: Protobuf idempotency simulation uses wire request hashes

- **WHEN** the same protobuf push request is submitted twice with the same client ID and idempotency key
- **THEN** the simulation SHALL replay the cached response without reapplying the push
- **AND** the idempotency hash SHALL be computed from the protobuf bytes

- **WHEN** a different protobuf body reuses the same client ID and idempotency key
- **THEN** the simulation SHALL reject the request as an idempotency conflict

#### Scenario: Protobuf pull simulation covers important server result shapes

- **WHEN** the server encodes protobuf pull responses
- **THEN** the simulation SHALL cover baseline rows, paginated responses, changed rows mixed with deleted IDs, delete-only responses, and server-wins reconciliation pulls
- **AND** every decoded response SHALL preserve cursor, `hasMore`, `serverTime`, table names, changed row objects, and deleted IDs

#### Scenario: Protobuf status simulation preserves cursor semantics

- **WHEN** a protobuf status request and response are processed
- **THEN** the simulation SHALL decode the request cursor into the same logical cursor semantics as JSON
- **AND** encode/decode `changedTables`, `hasChanges`, `cursor`, and `serverTime` through protobuf without shape drift
