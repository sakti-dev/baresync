## MODIFIED Requirements

### Requirement: defineSyncContract for contract definition

The `packages/baresync/src/schema/contract.ts` module SHALL export `defineSyncContract(input)` that accepts:

- `encoding`: `"json" | "protobuf"`
- `packageName`: a dot-separated namespace string (e.g., `"example.sync.v1"`)
- `tables`: an array of `SyncedTableDefinition` objects
- Optional `limits` object with `maxPushBytes` and `maxPushRows`

The function SHALL return a `SyncContract` object with the selected encoding preserved.

#### Scenario: defineSyncContract with JSON encoding

- **WHEN** `defineSyncContract` is called with `encoding: "json"`, a `packageName`, and at least one table
- **THEN** a `SyncContract` object is returned with the specified encoding, package name, tables, and limits

#### Scenario: defineSyncContract with protobuf encoding

- **WHEN** `defineSyncContract` is called with `encoding: "protobuf"`, a `packageName`, and at least one table
- **THEN** a `SyncContract` object is returned with `encoding: "protobuf"`
- **AND** the same structural validation rules still apply

### Requirement: syncSchema batteries-included shorthand

The `packages/baresync/src/schema/contract.ts` module SHALL export `syncSchema(input)` as a shorthand that calls `defineSyncContract` with default limits.

#### Scenario: syncSchema uses default JSON encoding

- **WHEN** `syncSchema` is called without an `encoding` property
- **THEN** the resulting contract uses `encoding: "json"`
- **AND** the resulting contract uses `maxPushBytes: 2097152` and `maxPushRows: 2000`

#### Scenario: syncSchema accepts protobuf encoding

- **WHEN** `syncSchema` is called with `encoding: "protobuf"`
- **THEN** the resulting contract preserves `encoding: "protobuf"`
