## Purpose

Define the request-level contract tests and SQLite-backed state for the deterministic fixture backend used by public fixture E2E smoke runs.

## Requirements

### Requirement: SQLite-backed fixture backend
The fixture backend SHALL store deterministic fixture rows, pushed rows, and reset state in SQLite instead of process-local arrays.

#### Scenario: In-memory database for contract tests
- **WHEN** backend contract tests start the fixture backend
- **THEN** the backend SHALL use an isolated in-memory Bun SQLite database for that test server process
- **AND** the database SHALL contain the fixture schema needed for categories, products, and pushed row records

#### Scenario: Reset restores seeded database state
- **WHEN** a contract test calls `POST /__reset`
- **THEN** the backend SHALL clear pushed rows and restore deterministic seeded category and product rows from SQLite

#### Scenario: State endpoint reads from database
- **WHEN** a contract test calls `GET /__state`
- **THEN** the response SHALL reflect the current SQLite-backed fixture state
- **AND** the response SHALL include pushed rows that were persisted by previous push requests in the same server process

### Requirement: Fixture backend request-level contracts
The fixture backend SHALL have request-level contract tests that exercise the running HTTP server instead of only testing helper functions.

#### Scenario: Contract test owns server lifecycle
- **WHEN** a backend contract test runs
- **THEN** it SHALL allocate an isolated port, start `tests/e2e/backend/fixture-server.ts`, wait for readiness through `GET /__state`, and stop the server after the test

#### Scenario: Contract covers sync endpoints
- **WHEN** the contract test sends requests to the running backend
- **THEN** it SHALL exercise `POST /sync/status`, `POST /sync/pull`, and `POST /sync/push`
- **AND** it SHALL assert successful responses, deterministic cursors, deterministic server time, table ordering, changed rows, deleted IDs, and push acknowledgements

#### Scenario: Contract covers management endpoints
- **WHEN** the contract test sends requests to the running backend
- **THEN** it SHALL exercise `POST /__reset` and `GET /__state`
- **AND** it SHALL assert reset behavior before and after push mutations

#### Scenario: Contract rejects invalid scope
- **WHEN** the contract test sends status, pull, or push requests with a scope other than the configured fixture scope
- **THEN** the backend SHALL return the documented invalid-scope response
- **AND** the SQLite fixture state SHALL remain unchanged

### Requirement: Fixture backend transport parity
The fixture backend contract tests SHALL run the same logical scenario in both JSON and protobuf transport modes.

#### Scenario: JSON contract path
- **WHEN** the contract test runs in `json` mode
- **THEN** requests SHALL use JSON request bodies
- **AND** responses SHALL decode to the expected logical payloads

#### Scenario: Protobuf contract path
- **WHEN** the contract test runs in `protobuf` mode
- **THEN** requests SHALL be encoded with the generated fixture protobuf runtime
- **AND** responses SHALL be decoded with the generated fixture protobuf runtime
- **AND** decoded logical payloads SHALL match the JSON contract expectations

#### Scenario: Push persists in both transports
- **WHEN** a JSON or protobuf contract test sends a push request containing changed rows and deleted IDs
- **THEN** the backend SHALL persist pushed changed rows in SQLite
- **AND** the push response SHALL acknowledge accepted created and deleted IDs for each table
- **AND** a subsequent `GET /__state` response SHALL expose the persisted pushed rows

### Requirement: Fixture backend verification commands
The E2E package SHALL expose or document a host-side command for running fixture backend contract tests.

#### Scenario: Backend contract test command is documented
- **WHEN** maintainers inspect the E2E documentation
- **THEN** they SHALL find the command for running fixture backend contract tests
- **AND** the command SHALL not require a desktop app, Android device, Maestro, or tauri-driver
