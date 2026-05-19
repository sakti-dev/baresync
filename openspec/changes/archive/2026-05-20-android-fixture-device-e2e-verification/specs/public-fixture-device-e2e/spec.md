## ADDED Requirements

### Requirement: Verified Android smoke execution
The system SHALL only consider the public fixture Android smoke complete when it has been executed successfully against a connected adb device or emulator.

#### Scenario: Android smoke completion requires real device execution
- **WHEN** maintainers mark Android fixture E2E verification complete
- **THEN** they SHALL have run the Android smoke command against a connected adb target and recorded the command result in the change verification evidence

#### Scenario: Android scaffold is not treated as verified behavior
- **WHEN** Android automation exists but has not passed on a connected adb target
- **THEN** documentation and task status SHALL describe it as scaffolded or pending verification rather than working end-to-end behavior
