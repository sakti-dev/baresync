## ADDED Requirements

### Requirement: Canonical inventory example workspace
The repository MUST provide one canonical fullstack example for Baresync under `examples/inventory`.

#### Scenario: Example workspace exists
- **WHEN** a contributor clones the repository
- **THEN** they can find a complete inventory example workspace at `examples/inventory`

### Requirement: Example workspace structure
The inventory example MUST be organized as a monorepo-style workspace with separate app, server, and shared contract packages.

#### Scenario: Workspace boundaries are clear
- **WHEN** a contributor inspects the example layout
- **THEN** they can identify `apps/app`, `apps/server`, and `packages/sync-contract` as distinct responsibilities

### Requirement: Inventory domain model
The example MUST use a small inventory domain with at least locations, items, and stock counts.

#### Scenario: Domain is understandable
- **WHEN** a contributor reads the example schema
- **THEN** they can see how inventory data is modeled without needing SaaS terminology

### Requirement: Single-scope example
The example MUST remain single-scope and MUST NOT introduce tenant, workspace, organization, or merchant concepts.

#### Scenario: No multi-tenant wording
- **WHEN** a contributor reads the docs or code comments for the example
- **THEN** they do not see tenant-style concepts presented as part of the example domain

### Requirement: Published package imports
The example MUST use the published Baresync package names in its imports and configuration.

#### Scenario: Example is external-consumer friendly
- **WHEN** a contributor copies the example into a new repository
- **THEN** the import paths and package references still describe a public consumer workflow

### Requirement: Fullstack sync demonstration
The example MUST demonstrate the full sync path across a Tauri client, a Hono backend, and a shared sync contract package.

#### Scenario: End-to-end flow is visible
- **WHEN** a contributor follows the example code
- **THEN** they can see where the shared schema lives, where the backend handler lives, and where the client sync calls happen

### Requirement: JSON-first quick start
The example documentation MUST present JSON sync encoding as the primary walkthrough path.

#### Scenario: First-time user path is simple
- **WHEN** a new user reads the quick start
- **THEN** they can follow the example without needing protobuf knowledge first

### Requirement: Example documentation entry point
The repository documentation MUST point new users to the inventory example as the recommended fullstack starting point.

#### Scenario: User looks for a starter
- **WHEN** a user opens the docs or README looking for an example
- **THEN** they are directed to the inventory example as the canonical starting point
