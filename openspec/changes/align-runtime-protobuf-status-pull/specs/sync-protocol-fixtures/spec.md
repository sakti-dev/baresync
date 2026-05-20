## ADDED Requirements

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
