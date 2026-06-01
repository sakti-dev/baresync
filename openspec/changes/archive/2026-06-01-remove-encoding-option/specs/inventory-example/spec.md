## MODIFIED Requirements

### Requirement: JSON-first quick start

The example documentation MUST present JSON sync as the primary walkthrough path without referencing alternative encodings or an `encoding` configuration option.

#### Scenario: First-time user path is simple

- **WHEN** a new user reads the quick start
- **THEN** they can follow the example without needing transport implementation details first
- **AND** the example code does not include `encoding: "json"` in `createSyncClient`, `defineSyncConfig`, or handler factory calls

## REMOVED Requirements

### Requirement: Example configures encoding explicitly
**Reason**: The framework has committed to JSON as the only supported wire format. The example documented `encoding: "json"` in multiple call sites; that option has been removed.
**Migration**: The example no longer references `encoding` in any config or call site. Consumers following the example should also drop `encoding: "json"` from their own code.
