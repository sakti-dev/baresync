## Purpose

TBD. Canonical sync protocol fixture shapes for host-side simulation coverage.

## ADDED Requirements

### Requirement: Category-product baseline pull fixture
The `packages/baresync/fixtures/sync/category-product-baseline-pull.json` file SHALL define a pull response containing two tables: `categories` (1 changed row) and `products` (1 changed row with FK to categories). The fixture SHALL include a valid cursor string, `hasMore: false`, and `serverTime`. Row data SHALL use stable IDs (`cat-1`, `prod-1`), stable timestamps, and scope ID `merchant-1`.

#### Scenario: Fixture file is valid JSON with required fields
- **WHEN** the fixture file is loaded
- **THEN** it SHALL contain `cursor`, `hasMore`, `serverTime`, and `tables` fields
- **AND** `tables` SHALL be an array with 2 entries (categories, products)

#### Scenario: Categories table has one changed row with no deleted IDs
- **WHEN** the categories table entry is examined
- **THEN** `changedRows` SHALL contain 1 row with `id: "cat-1"` and `merchantId: "merchant-1"`
- **AND** `deletedIds` SHALL be an empty array

#### Scenario: Products table has one changed row referencing categories
- **WHEN** the products table entry is examined
- **THEN** `changedRows` SHALL contain 1 row with `id: "prod-1"` and `categoryId: "cat-1"`
- **AND** `deletedIds` SHALL be an empty array

### Requirement: Category-product push fixture
The `packages/baresync/fixtures/sync/category-product-push.json` file SHALL define a push request body containing two table changes: categories (1 changed row) and products (1 changed row). The body SHALL include `scopeId`, `clientId`, `idempotencyKey`, and `tables`.

#### Scenario: Fixture contains push envelope fields
- **WHEN** the fixture file is loaded
- **THEN** it SHALL contain `scopeId: "merchant-1"`, `clientId`, `idempotencyKey`, and `tables`

#### Scenario: Push tables follow upsert order
- **WHEN** the tables array is examined
- **THEN** categories SHALL appear before products

### Requirement: Server soft-delete fixture
The `packages/baresync/fixtures/sync/server-soft-delete.json` file SHALL define a pull response where one product row is in `deletedIds` (soft-deleted by server) and zero changed rows for products.

#### Scenario: Product is in deletedIds
- **WHEN** the products table entry is examined
- **THEN** `deletedIds` SHALL contain `"prod-1"`
- **AND** `changedRows` SHALL be empty for products

### Requirement: Server-wins rejection fixture
The `packages/baresync/fixtures/sync/server-wins-rejection.json` file SHALL define a push response that marks one table as rejected with reason `server_newer`, and a follow-up pull response that returns the server's version of the rejected row.

#### Scenario: Push response contains rejected table
- **WHEN** the push response section is examined
- **THEN** it SHALL contain a `rejected` entry for `"categories"` with reason `"server_newer"`

#### Scenario: Follow-up pull returns server version
- **WHEN** the pull response section is examined
- **THEN** it SHALL contain the server's version of the rejected category row with updated field values

### Requirement: Idempotent replay fixture
The `packages/baresync/fixtures/sync/idempotent-replay.json` file SHALL define two push request bodies with identical `(clientId, idempotencyKey, requestHash)` but submitted at different times. The second submission SHALL produce a replay (cached response) rather than re-execution.

#### Scenario: Both requests share same identity triple
- **WHEN** both request bodies are compared
- **THEN** `clientId`, `idempotencyKey`, and `requestHash` SHALL be identical

### Requirement: Payload too large fixture
The `packages/baresync/fixtures/sync/payload-too-large.json` file SHALL define a push request body that exceeds the default max push bytes limit, suitable for testing 413 split-retry behavior.

#### Scenario: Fixture body exceeds 256 KiB
- **WHEN** the fixture body is serialized to JSON
- **THEN** the byte length SHALL exceed `DEFAULT_POS_TARGET_PUSH_BYTES` (262144)

#### Scenario: Fixture has multiple rows to allow splitting
- **WHEN** the tables are examined
- **THEN** at least one table SHALL have more than 1 row so that the chunk can be split in half

### Requirement: Fixture stability
All fixture files SHALL use deterministic IDs, timestamps, and scope IDs. No fixture SHALL depend on runtime state, random values, or external services.

#### Scenario: IDs are stable across loads
- **WHEN** a fixture is loaded multiple times
- **THEN** all IDs, timestamps, and scope IDs SHALL be identical

### Requirement: Fixture scope coverage
All fixtures SHALL use scope ID `"merchant-1"` and include the FK relationship between `categories` and `products` where both tables are present.

#### Scenario: FK relationship present
- **WHEN** both categories and products appear in a fixture
- **THEN** the product row SHALL reference the category row via `categoryId: "cat-1"`

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

### Requirement: Status protocol fixture
The `packages/baresync/fixtures/sync/` fixture set SHALL include canonical JSON status request and response payloads. The request SHALL contain `scopeId` and `cursor`. The response SHALL contain `changedTables`, `hasChanges`, `cursor`, and `serverTime`.

#### Scenario: Status fixture contains request fields

- **WHEN** the status request fixture is loaded
- **THEN** it SHALL contain `scopeId: "merchant-1"` and a deterministic cursor

#### Scenario: Status fixture contains response fields

- **WHEN** the status response fixture is loaded
- **THEN** it SHALL contain deterministic `changedTables`, `hasChanges`, `cursor`, and `serverTime` fields

### Requirement: Runtime status decision fixtures
The fixture set SHALL include or derive deterministic cases for status-driven runtime decisions: skip, push-only, pull-only, full sync, and full resync.

#### Scenario: Skip fixture has no local or server changes

- **WHEN** the skip decision fixture is evaluated
- **THEN** local dirty count SHALL be zero
- **AND** server status SHALL report `hasChanges: false`

#### Scenario: Pull-only fixture has server changes only

- **WHEN** the pull-only decision fixture is evaluated
- **THEN** local dirty count SHALL be zero
- **AND** server status SHALL report changed tables

#### Scenario: Push-only fixture has local changes only

- **WHEN** the push-only decision fixture is evaluated
- **THEN** local dirty count SHALL be greater than zero
- **AND** server status SHALL report `hasChanges: false`

#### Scenario: Full sync fixture has local and server changes

- **WHEN** the full sync decision fixture is evaluated
- **THEN** local dirty count SHALL be greater than zero
- **AND** server status SHALL report changed tables
