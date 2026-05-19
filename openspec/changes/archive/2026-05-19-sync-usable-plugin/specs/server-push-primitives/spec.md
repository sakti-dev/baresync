## MODIFIED Requirements

### Requirement: decodeSyncRequest

The `decodeSyncRequest` function SHALL accept a `{ encoding, kind, request }` input, parse the request body as JSON, validate required fields for the given kind ("push" or "pull"), compute SHA-256 of the raw request body, and return `{ body, requestHash }`.

#### Scenario: Push request decoded with request hash

- **WHEN** a JSON push request is decoded
- **THEN** the returned `requestHash` SHALL be the SHA-256 hex digest of the serialized request body

#### Scenario: Missing required push field throws

- **WHEN** a push request body is missing `scopeId`, `clientId`, `idempotencyKey`, or `tables`
- **THEN** an error SHALL be thrown identifying the missing field

#### Scenario: Missing required pull field throws

- **WHEN** a pull request body is missing `scopeId`, `tables`, or `cursor`
- **THEN** an error SHALL be thrown identifying the missing field
