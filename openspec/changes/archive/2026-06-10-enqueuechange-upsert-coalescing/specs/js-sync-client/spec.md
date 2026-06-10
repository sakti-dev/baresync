## MODIFIED Requirements

### Requirement: Explicit enqueue primitive

The JS sync client SHALL expose `enqueueChange(tx, options)` that upserts one pending `sync_outbox` row using the transaction provided by the caller. If a pending outbox entry already exists for the same `(table_name, row_id)` where `synced_at IS NULL`, the operation SHALL be coalesced: the existing `"insert"` operation SHALL be preserved (since the server never saw the row), and `"update"` operations SHALL be replaced by the new operation. The `changedAt` timestamp SHALL always be refreshed on conflict.

#### Scenario: Enqueue derives sync bookkeeping

- **WHEN** `client.enqueueChange(tx, { table, rowId, operation })` is called
- **THEN** the client SHALL derive `tableName` from the Drizzle table
- **AND** the client SHALL use the configured `scopeId`
- **AND** the client SHALL generate `changedAt`
- **AND** the client SHALL generate the outbox id

#### Scenario: Bulk update enqueues one row per affected id

- **WHEN** a consumer updates multiple rows in one transaction
- **THEN** the consumer SHALL call `enqueueChange` once per affected row id inside the same `writeTransaction`
- **AND** the JS client SHALL support multiple `enqueueChange` calls in that transaction

#### Scenario: Enqueue with no existing pending entry inserts a new row

- **WHEN** `enqueueChange(tx, { table, rowId, operation })` is called and no pending outbox row exists for the same `(table_name, row_id)`
- **THEN** a new outbox row SHALL be inserted with the provided operation

#### Scenario: Enqueue update after insert preserves insert operation

- **WHEN** a pending outbox row exists with `operation = "insert"` for `(table_name, row_id)`
- **AND** `enqueueChange(tx, { table, rowId, operation: "update" })` is called for the same row
- **THEN** the outbox row's operation SHALL remain `"insert"`
- **AND** `changedAt` SHALL be refreshed

#### Scenario: Enqueue update after update uses new operation

- **WHEN** a pending outbox row exists with `operation = "update"` for `(table_name, row_id)`
- **AND** `enqueueChange(tx, { table, rowId, operation: "update" })` is called for the same row
- **THEN** the outbox row's operation SHALL be `"update"`
- **AND** `changedAt` SHALL be refreshed

#### Scenario: Enqueue after sync inserts a fresh row

- **WHEN** a previous outbox row for `(table_name, row_id)` has been marked as synced (`synced_at IS NOT NULL`)
- **AND** `enqueueChange(tx, { table, rowId, operation: "update" })` is called
- **THEN** a new outbox row SHALL be inserted (no conflict, previous row is outside the partial index)
