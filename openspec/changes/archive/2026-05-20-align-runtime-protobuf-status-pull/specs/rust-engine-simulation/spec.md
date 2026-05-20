## ADDED Requirements

### Requirement: Status-aware sync decision simulation

The Rust engine simulation SHALL include tests proving that `sync_now` uses local sync state and server status to choose skip, push-only, pull-only, full sync, and full resync behavior.

#### Scenario: No-op sync skips transfer work

- **WHEN** local dirty count is zero and server status reports `hasChanges: false`
- **THEN** `sync_now` SHALL skip push and pull transfer requests
- **AND** the result SHALL indicate skipped work

#### Scenario: Push-only sync skips pull

- **WHEN** local dirty count is greater than zero and server status reports `hasChanges: false`
- **THEN** `sync_now` SHALL push local changes without issuing a pull request

#### Scenario: Pull-only sync uses changed tables

- **WHEN** local dirty count is zero and server status reports changed tables
- **THEN** `sync_now` SHALL pull only the changed tables returned by status
- **AND** it SHALL skip push

#### Scenario: Full sync pulls changed tables before push

- **WHEN** local dirty count is greater than zero and server status reports changed tables
- **THEN** `sync_now` SHALL pull the changed tables before pushing local changes

#### Scenario: Full resync remains available

- **WHEN** local state reports `needs_baseline_sync`
- **THEN** `sync_now` SHALL perform baseline pull behavior and SHALL NOT skip transfer work because status reports no changes

### Requirement: Runtime protobuf status and pull simulation

The Rust engine simulation SHALL include tests proving that protobuf status and pull transport paths encode requests and decode responses as protobuf bytes.

#### Scenario: Protobuf status request is sent and decoded

- **WHEN** `sync_now` requests status with `encoding: "protobuf"`
- **THEN** the simulated transport SHALL receive protobuf request bytes
- **AND** the runtime SHALL decode the protobuf status response into changed table metadata

#### Scenario: Protobuf pull request is sent and decoded

- **WHEN** `sync_now` performs a pull with `encoding: "protobuf"`
- **THEN** the simulated transport SHALL receive protobuf request bytes
- **AND** the runtime SHALL decode protobuf pull response rows and tombstones
