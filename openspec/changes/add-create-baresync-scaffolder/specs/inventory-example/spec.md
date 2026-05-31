## MODIFIED Requirements

### Requirement: Example documentation entry point

The repository documentation MUST point new users to the create scaffolder as the recommended project starting point and to the inventory example as the canonical fullstack reference.

#### Scenario: User looks for a starter

- **WHEN** a user opens the docs or README looking for a way to start a new app
- **THEN** they are directed to the create scaffolder as the default new-project path
- **AND** they are directed to the inventory example as the richer fullstack reference implementation

#### Scenario: Manual setup remains available

- **WHEN** a user cannot use the create scaffolder or wants to wire an existing project
- **THEN** documentation SHALL still provide manual setup guidance for Tauri, server, and sync-contract integration
