## ADDED Requirements

### Requirement: Device-like invoke simulation

The JS sync client SHALL support device-like simulation through injected Tauri invocation without requiring a Tauri runtime at test time.

#### Scenario: Propagate mocked command results

- **WHEN** a sync client method calls an injected `invoke` function that resolves with a value
- **THEN** the method SHALL resolve with that value

#### Scenario: Propagate mocked command errors

- **WHEN** a sync client method calls an injected `invoke` function that rejects with an error
- **THEN** the method SHALL reject with that error

#### Scenario: Preserve command argument shape

- **WHEN** a sync client method is called in a JS simulation test
- **THEN** the injected `invoke` function SHALL receive the same command name and argument shape used by the Tauri plugin commands
