## Purpose

Define public integration guidance and compatibility checks for consumer Tauri apps that adopt Baresync without depending on private downstream app source code.

## Requirements

### Requirement: Consumer integration guide
The system SHALL provide public guidance for integrating Baresync into a consumer Tauri app without depending on private app source code.

#### Scenario: Ordered integration checklist
- **WHEN** a consumer reads the integration guidance
- **THEN** it SHALL describe the ordered steps for generating artifacts, registering the Rust plugin, configuring DB path and migrations, wiring the JS sync client, wiring the Drizzle proxy helper, running preflight checks, and running optional device smoke validation

#### Scenario: Private app independence
- **WHEN** a maintainer reads the integration guidance
- **THEN** it SHALL NOT require `docs/external/sakti-pos`, Sakti app routes, Sakti auth, Sakti schema, or Sakti-specific commands

### Requirement: Compatibility checklist
The system SHALL define compatibility checks that private consumer apps can apply before running full device automation.

#### Scenario: Required integration seams listed
- **WHEN** a consumer follows the compatibility checklist
- **THEN** the checklist SHALL cover plugin registration, command names, scope ID mapping, API URL, encoding, limits, contract table order, generated artifact freshness, embedded migrations, SQLite DB path, Drizzle proxy commands, migration status, DB info, local sync state, and failure artifact setup

#### Scenario: Verification order documented
- **WHEN** a consumer prepares to validate integration
- **THEN** the checklist SHALL direct them to run host tests first, then public fixture smoke, then private app desktop or Android smoke outside this repo

### Requirement: Integration preflight checks
The system SHALL provide either documented preflight steps or helper APIs that validate common consumer integration mistakes before device smoke runs.

#### Scenario: Command and DB preflight
- **WHEN** preflight checks run in a consumer app context
- **THEN** they SHALL verify command invocation, DB info availability, migration status availability, and at least one Drizzle proxy read through the configured invoke path

#### Scenario: Sync contract preflight
- **WHEN** preflight checks inspect generated or declared sync contract metadata
- **THEN** they SHALL report missing table order, missing local-only columns metadata, unsupported encoding, or missing limits in a way that can be acted on before a device run

### Requirement: Failure artifact conventions
The system SHALL document safe failure artifact conventions for private consumer integrations.

#### Scenario: Safe artifact categories
- **WHEN** a consumer configures failure artifact collection
- **THEN** the guidance SHALL distinguish safe public fixture artifacts from private app artifacts that require redaction, including logs, logcat output, DB snapshots, command payload samples, environment summaries, and generated manifest evidence

#### Scenario: Secrets are not collected by default
- **WHEN** failure artifact guidance describes private app usage
- **THEN** it SHALL require tokens, session values, raw customer rows, and secrets to be redacted or excluded by default

### Requirement: Consumer-owned auth and scope mapping
The system SHALL document that auth/session ownership remains in the consumer app while Baresync owns sync transport and local runtime integration.

#### Scenario: Auth boundary is explicit
- **WHEN** a consumer integrates Baresync with app authentication
- **THEN** the guidance SHALL explain how app-owned session/auth state maps to public Baresync configuration or invocation without requiring a Baresync-specific auth system

#### Scenario: Scope boundary is explicit
- **WHEN** a consumer maps app concepts such as merchant, outlet, tenant, or workspace to Baresync
- **THEN** the guidance SHALL explain that the consumer must provide a stable `scopeId` compatible with its generated contract and server routes
