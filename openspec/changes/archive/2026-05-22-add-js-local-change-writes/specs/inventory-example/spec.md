## ADDED Requirements

### Requirement: Inventory example uses JS local write helpers
The inventory example SHALL use the public JS sync client local write helpers for local row mutations that need sync outbox entries.

#### Scenario: Seed flow writes through transaction helper
- **WHEN** the inventory example creates sample location, item, and stock count rows
- **THEN** those row mutations SHALL run inside one `client.writeTransaction(db, callback)` call
- **AND** each row mutation SHALL be paired with exactly one `writeLocalChange` or `enqueueChange` call in that transaction

#### Scenario: Soft delete writes through transaction helper
- **WHEN** the inventory example soft-deletes one row from the UI
- **THEN** the row update and matching outbox enqueue SHALL run inside one `client.writeTransaction(db, callback)` call
- **AND** the outbox operation SHALL be `"update"`

### Requirement: Inventory example does not teach raw outbox insertion
The inventory example UI and domain-write modules SHALL NOT require components to import or insert into `syncOutbox` directly.

#### Scenario: Components call domain write helpers
- **WHEN** a reader inspects inventory React components
- **THEN** components SHALL call app domain write helpers
- **AND** components SHALL NOT construct `sync_outbox` rows directly

#### Scenario: Domain helper delegates sync bookkeeping
- **WHEN** a reader inspects the inventory domain write helper
- **THEN** sync bookkeeping such as `tableName`, `scopeId`, `changedAt`, and outbox id SHALL be delegated to the JS sync client helper
