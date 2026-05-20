## ADDED Requirements

### Requirement: Public fixture smoke transport mode
The system SHALL allow the public fixture smoke harness and fixture app/backend wiring to run in either `json` or `protobuf` transport mode using a shared configuration source.

#### Scenario: Selected transport is propagated
- **WHEN** automation launches the fixture smoke in `protobuf` mode
- **THEN** the fixture app and test backend SHALL use protobuf transport for sync request and response bodies
- **AND** the same smoke scenario SHALL remain executable in `json` mode without code changes

### Requirement: Public fixture smoke transport matrix
The system SHALL execute the same public fixture smoke scenario against both JSON and protobuf transports and assert equivalent user-visible behavior.

#### Scenario: Desktop smoke passes in both transports
- **WHEN** the desktop smoke scenario runs in `json` mode and again in `protobuf` mode
- **THEN** baseline pull, local create, manual sync, backend state, and restart persistence SHALL all satisfy the same assertions

#### Scenario: Android smoke passes in both transports
- **WHEN** the Android smoke scenario runs in `json` mode and again in `protobuf` mode
- **THEN** baseline pull, local create, manual sync, backend state, and restart persistence SHALL all satisfy the same assertions
