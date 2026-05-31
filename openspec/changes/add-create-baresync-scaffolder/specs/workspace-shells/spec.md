## ADDED Requirements

### Requirement: Create package workspace shell

The repository SHALL include a create-style package shell for scaffolding new Baresync projects.

#### Scenario: Create package has package metadata

- **WHEN** a contributor inspects the workspace packages
- **THEN** they SHALL find a create package with package metadata, source entrypoint, build script, and binary metadata suitable for create-style package-manager execution

#### Scenario: Create package is separate from library package

- **WHEN** a consumer installs the `baresync` library package
- **THEN** scaffolder-only dependencies SHALL NOT be included as direct runtime dependencies of the `baresync` library package

#### Scenario: Workspace scripts can verify create package

- **WHEN** contributors run repository verification commands
- **THEN** the create package TypeScript source SHALL be covered by the relevant typecheck and lint/format checks
