## ADDED Requirements

### Requirement: Consumer integration contract
The JS sync client SHALL expose and document the command argument shape that consumer apps must preserve when integrating with the Tauri plugin.

#### Scenario: Command shape documented
- **WHEN** a consumer reads JS sync client integration guidance
- **THEN** it SHALL state the command names and argument shape used by `syncNow`, `push`, `pull`, `fullResync`, and `getState`

#### Scenario: Custom invoke remains supported
- **WHEN** a private app wraps or instruments Tauri invocation
- **THEN** the JS sync client SHALL continue to support a custom `invoke` function for testing, logging, error mapping, or app-specific shell integration

### Requirement: Consumer error propagation
The JS sync client SHALL preserve plugin command failures in a form that consumer apps can classify and display.

#### Scenario: Plugin error reaches consumer
- **WHEN** a sync client method receives a rejected command invocation
- **THEN** the method SHALL reject without hiding the original error message or structured error value

#### Scenario: Integration docs describe error boundary
- **WHEN** a consumer reads integration guidance
- **THEN** it SHALL explain that app UI state, retry policy, toast messages, and auth-expiry handling remain consumer responsibilities around the JS sync client

