## ADDED Requirements

### Requirement: Transaction-scoped local write API
The JS sync client SHALL expose `writeTransaction(db, callback)` that runs `callback` inside the provided Drizzle database transaction and returns the callback result.

#### Scenario: Transaction callback commits
- **WHEN** `client.writeTransaction(db, callback)` is called and `callback` resolves
- **THEN** the callback SHALL run with a Drizzle transaction object
- **AND** the transaction SHALL commit
- **AND** `writeTransaction` SHALL resolve with the callback result

#### Scenario: Transaction callback rolls back
- **WHEN** `client.writeTransaction(db, callback)` is called and `callback` rejects
- **THEN** the transaction SHALL roll back
- **AND** `writeTransaction` SHALL reject with the original error

### Requirement: Single-row local change helper
The JS sync client SHALL expose `writeLocalChange(tx, options)` for single-row local mutations. The helper SHALL run `options.write(tx)` and then enqueue exactly one outbox row for `options.table`, `options.rowId`, and `options.operation` in the same transaction.

#### Scenario: Single-row insert enqueues outbox
- **WHEN** `client.writeLocalChange(tx, { table, rowId, operation: "insert", write })` is called inside `writeTransaction`
- **THEN** the domain row mutation SHALL execute using the provided transaction
- **AND** exactly one pending `sync_outbox` row SHALL be inserted for the same table and row id

#### Scenario: Single-row soft delete uses update operation
- **WHEN** `client.writeLocalChange(tx, { table, rowId, operation: "update", write })` soft-deletes one local row by setting `deletedAt`
- **THEN** the outbox row SHALL use `operation: "update"`
- **AND** the helper SHALL NOT require consumers to pass `tableName`, `scopeId`, or `changedAt`

### Requirement: Explicit enqueue primitive
The JS sync client SHALL expose `enqueueChange(tx, options)` that inserts one pending `sync_outbox` row using the transaction provided by the caller.

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

### Requirement: Bulk mutation safety boundary
`writeLocalChange` SHALL be documented and typed as a single-row helper. It SHALL NOT claim to detect every row affected by arbitrary Drizzle update or delete predicates.

#### Scenario: Single-row helper does not infer bulk effects
- **WHEN** a caller passes a write callback that updates multiple rows
- **THEN** `writeLocalChange` SHALL still enqueue only the single `rowId` provided by the caller
- **AND** docs SHALL instruct consumers to use `enqueueChange` in a loop for bulk mutations

### Requirement: Local write helper operations
The JS local write helpers SHALL support `operation: "insert"` and `operation: "update"` for the documented common path.

#### Scenario: Common operations are accepted
- **WHEN** a consumer calls `writeLocalChange` or `enqueueChange` with `operation: "insert"` or `operation: "update"`
- **THEN** the helper SHALL enqueue the change without requiring hard-delete semantics

#### Scenario: Hard delete remains out of common path
- **WHEN** a consumer needs hard-delete tombstone behavior
- **THEN** that behavior SHALL remain outside the documented `writeLocalChange` common path for this change
