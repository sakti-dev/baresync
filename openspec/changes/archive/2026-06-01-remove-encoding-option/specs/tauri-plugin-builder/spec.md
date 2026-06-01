## MODIFIED Requirements

### Requirement: Consumer plugin registration contract

The Tauri plugin builder integration SHALL document the required configuration a consumer app must provide for production-like sync behavior.

#### Scenario: Required builder inputs documented

- **WHEN** a consumer reads plugin registration guidance
- **THEN** it SHALL describe API base URL, max push bytes, max push rows, DB path or DB name, generated contract metadata, and migration source as explicit integration inputs

#### Scenario: Builder config avoids hidden app coupling

- **WHEN** a consumer registers the plugin
- **THEN** the documented pattern SHALL NOT require private app modules, fixture app modules, Sakti-specific command handlers, or app-local wrappers for Baresync plugin commands

### Requirement: Plugin setup logging

The plugin SHALL log configuration and contract resolution at startup using the `log` crate.

#### Scenario: Plugin logs setup info

- **WHEN** the plugin is registered
- **THEN** it SHALL log api_url, db path, and contract tables (upsert_order, delete_order) at info level

#### Scenario: Polling logs errors instead of swallowing

- **WHEN** a polling sync cycle fails
- **THEN** the plugin SHALL log the error instead of silently discarding it

### Requirement: Plugin integration diagnostics

The plugin integration SHALL provide documented or testable diagnostics for confirming registration and configuration.

#### Scenario: Registration smoke check

- **WHEN** a consumer runs integration preflight
- **THEN** it SHALL be possible to confirm that DB, migration, local state, and sync commands are callable through the registered plugin

#### Scenario: Config mismatch is actionable

- **WHEN** a consumer misconfigures API URL, DB path, limits, migrations, or contract table metadata
- **THEN** the integration guidance or helper checks SHALL identify the likely mismatch before full device smoke validation where practical

## REMOVED Requirements

### Requirement: Encoding configuration on the Rust builder
**Reason**: The framework has committed to JSON as the only supported wire format. The Rust `.encoding()` method on `BaresyncBuilder` and the `encoding` field on `PluginConfig` were pass-throughs that defaulted to `"json"`. Protobuf was never implemented.
**Migration**: Remove any call to `BaresyncBuilder::encoding()` from `lib.rs`. The plugin always serializes and deserializes JSON.
