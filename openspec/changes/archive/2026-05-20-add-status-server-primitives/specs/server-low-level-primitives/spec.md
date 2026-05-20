## MODIFIED Requirements

### Requirement: Sync request decoding and request hashing

The `packages/baresync/src/server/service.ts` module SHALL export `decodeSyncRequest(input)` that accepts an object with `encoding`, `kind` (`"push"`, `"pull"`, or `"status"`), a protobuf schema descriptor when `encoding` is `"protobuf"`, and a `Request` object, decodes the request body according to the selected encoding, validates required fields for the request kind, and returns `{ body, requestHash }`.

For JSON requests, the body SHALL be parsed as JSON.
For protobuf requests, the body SHALL be decoded from `application/x-protobuf` wire bytes using generated table and row message metadata where the request kind requires it.
The returned `requestHash` SHALL be the SHA-256 hash of the raw request body bytes.

#### Scenario: JSON push request is decoded

- **WHEN** `decodeSyncRequest` is called with `encoding: "json"`, `kind: "push"`, and a valid JSON request body
- **THEN** the decoded body SHALL contain the push envelope fields
- **AND** the returned `requestHash` SHALL be computed from the raw JSON request bytes

#### Scenario: Protobuf push request is decoded

- **WHEN** `decodeSyncRequest` is called with `encoding: "protobuf"`, `kind: "push"`, and a valid protobuf request body
- **THEN** the decoded body SHALL contain the push envelope fields
- **AND** the returned `requestHash` SHALL be computed from the raw protobuf wire bytes

#### Scenario: JSON status request is decoded

- **WHEN** `decodeSyncRequest` is called with `encoding: "json"`, `kind: "status"`, and a valid JSON request body
- **THEN** the decoded body SHALL contain `scopeId` and `cursor`
- **AND** the returned `requestHash` SHALL be computed from the raw JSON request bytes

#### Scenario: Protobuf status request is decoded

- **WHEN** `decodeSyncRequest` is called with `encoding: "protobuf"`, `kind: "status"`, and a valid protobuf request body
- **THEN** the decoded body SHALL contain `scopeId` and `cursor`
- **AND** the returned `requestHash` SHALL be computed from the raw protobuf wire bytes

#### Scenario: Status request missing scope fails

- **WHEN** `decodeSyncRequest` is called with `kind: "status"` and a request body missing `scopeId`
- **THEN** an error SHALL be thrown that identifies the missing status field

### Requirement: Sync response encoding

The `packages/baresync/src/server/service.ts` module SHALL export `encodeSyncResponse(input)` that accepts `body`, `encoding`, `kind` (`"push"`, `"pull"`, or `"status"`), and a protobuf schema descriptor when `encoding` is `"protobuf"`, and returns a `Response` with the appropriate `Content-Type`.

For JSON, the response SHALL have `Content-Type: application/json` and the body serialized as JSON.
For protobuf, the response SHALL have `Content-Type: application/x-protobuf` and the body serialized with generated protobuf messages.

#### Scenario: Protobuf request body is row-typed

- **WHEN** `decodeSyncRequest` is called with `encoding: "protobuf"`, `kind: "push"`, a protobuf schema descriptor, and a valid protobuf request body
- **THEN** the decoded body SHALL contain the push envelope fields
- **AND** each changed row SHALL decode as a typed protobuf row object, not a JSON string payload
- **AND** the returned `requestHash` SHALL be computed from the raw protobuf wire bytes

#### Scenario: JSON response is encoded

- **WHEN** `encodeSyncResponse` is called with `encoding: "json"`, `kind: "push"`, and a response body
- **THEN** the response SHALL use `Content-Type: application/json`

#### Scenario: Protobuf response is encoded

- **WHEN** `encodeSyncResponse` is called with `encoding: "protobuf"`, `kind: "pull"`, a protobuf schema descriptor, and a response body
- **THEN** the response SHALL use `Content-Type: application/x-protobuf`

#### Scenario: JSON status response is encoded

- **WHEN** `encodeSyncResponse` is called with `encoding: "json"`, `kind: "status"`, and a status body containing `changedTables`, `hasChanges`, `cursor`, and `serverTime`
- **THEN** the response SHALL use `Content-Type: application/json`
- **AND** the response body SHALL preserve the status fields

#### Scenario: Protobuf status response is encoded

- **WHEN** `encodeSyncResponse` is called with `encoding: "protobuf"`, `kind: "status"`, and a status body containing `changedTables`, `hasChanges`, `cursor`, and `serverTime`
- **THEN** the response SHALL use `Content-Type: application/x-protobuf`
- **AND** decoding the response bytes SHALL preserve the status fields
