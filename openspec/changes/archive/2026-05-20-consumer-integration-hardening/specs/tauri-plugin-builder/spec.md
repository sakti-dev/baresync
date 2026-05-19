## ADDED Requirements

### Requirement: Consumer plugin registration contract
The Tauri plugin builder integration SHALL document the required configuration a consumer app must provide for production-like sync behavior.

#### Scenario: Required builder inputs documented
- **WHEN** a consumer reads plugin registration guidance
- **THEN** it SHALL describe API base URL, encoding, max push bytes, max push rows, DB path, contract table metadata, and embedded migrations as explicit integration inputs

#### Scenario: Builder config avoids hidden app coupling
- **WHEN** a consumer registers the plugin
- **THEN** the documented pattern SHALL NOT require private app modules, fixture app modules, or Sakti-specific command handlers

### Requirement: Plugin integration diagnostics
The plugin integration SHALL provide documented or testable diagnostics for confirming registration and configuration.

#### Scenario: Registration smoke check
- **WHEN** a consumer runs integration preflight
- **THEN** it SHALL be possible to confirm that DB, migration, local state, and sync commands are callable through the registered plugin

#### Scenario: Config mismatch is actionable
- **WHEN** a consumer misconfigures encoding, API URL, DB path, limits, migrations, or contract table metadata
- **THEN** the integration guidance or helper checks SHALL identify the likely mismatch before full device smoke validation where practical

