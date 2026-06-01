## MODIFIED Requirements

### Requirement: Consumer plugin registration contract
The Tauri plugin builder integration SHALL document the required configuration a consumer app must provide for production-like sync behavior.

#### Scenario: Required builder inputs documented
- **WHEN** a consumer reads plugin registration guidance
- **THEN** it SHALL describe API base URL, DB path, generated contract metadata, and migration source as explicit integration inputs
- **AND** it SHALL NOT describe max push bytes, max push rows, transport, or db name as builder inputs — the sync engine uses safe defaults (256KB target, 2MB ceiling, 2000 rows) that work across all platforms, and JSON is the only supported encoding

#### Scenario: Builder config avoids hidden app coupling
- **WHEN** a consumer registers the plugin
- **THEN** the documented pattern SHALL NOT require private app modules, fixture app modules, Sakti-specific command handlers, or app-local wrappers for Baresync plugin commands
