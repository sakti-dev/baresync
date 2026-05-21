## ADDED Requirements

### Requirement: Drizzle proxy transaction support for local writes
The local database JS helper SHALL support Drizzle sqlite-proxy transactions as the transaction mechanism used by JS local write helpers.

#### Scenario: Transaction executes through proxy commands
- **WHEN** a consumer calls `db.transaction(callback)` on the database returned by `createTauriDrizzleDatabase`
- **THEN** Drizzle SHALL execute transaction control statements through the configured Tauri SQL command path
- **AND** statements inside the callback SHALL use the same transaction boundary

#### Scenario: Local write helpers can receive transaction object
- **WHEN** `client.writeTransaction(db, callback)` calls the callback
- **THEN** the transaction object provided to the callback SHALL be usable with normal Drizzle insert, update, select, and delete builders
- **AND** it SHALL be accepted by `client.writeLocalChange` and `client.enqueueChange`
