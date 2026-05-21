## Purpose

Canonical fullstack inventory example for Baresync.

## ADDED Requirements

### Requirement: Canonical inventory example workspace

The repository MUST provide one canonical fullstack example for Baresync under `examples/inventory-json-polling`.

#### Scenario: Example workspace exists

- **WHEN** a contributor clones the repository
- **THEN** they can find a complete inventory example workspace at `examples/inventory-json-polling`

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

### Requirement: Inventory server keeps both repository paths visible

The inventory example SHALL keep the primitive repository path in `examples/inventory-json-polling/apps/server/src/db/primitive/sync-repository.ts` and `examples/inventory-json-polling/apps/server/src/db/primitive/utils.ts` while also adding a helper-backed repository path in `examples/inventory-json-polling/apps/server/src/db/drizzle-helper/sync-repository.ts` that uses the public Drizzle repository helper from `baresync/server/drizzle` for cursor timestamp parsing, changed/deleted row splitting, pull table response construction, status changed-table detection, latest cursor formatting, latest-cursor row selection, push table validation, and table-specific read/write callbacks.

The example SHALL continue to keep inventory-specific row validation, row defaults, seed data, route handlers, and scope handling in app code.

#### Scenario: Primitive repository remains available

- **WHEN** a contributor reads `examples/inventory-json-polling/apps/server/src/db/primitive/sync-repository.ts`
- **THEN** the primitive inventory repository path SHALL remain available for comparison
- **AND** its local sync mechanics SHALL remain visible

#### Scenario: Helper-backed repository uses Drizzle helper for pull responses

- **WHEN** a contributor reads `examples/inventory-json-polling/apps/server/src/db/drizzle-helper/sync-repository.ts`
- **THEN** pull response construction SHALL be delegated to the Drizzle repository helper
- **AND** the helper-backed repository SHALL NOT carry a custom local implementation of the same helper behavior

#### Scenario: Helper-backed repository uses Drizzle helper for status responses

- **WHEN** a contributor reads `examples/inventory-json-polling/apps/server/src/db/drizzle-helper/sync-repository.ts`
- **THEN** status changed-table detection SHALL be delegated to the Drizzle repository helper
- **AND** the repository SHALL NOT carry a custom local implementation of the same helper behavior

#### Scenario: Helper-backed repository keeps app-specific row mapping visible

- **WHEN** a contributor reads table configuration in `examples/inventory-json-polling/apps/server/src/db/drizzle-helper/sync-repository.ts`
- **THEN** table-specific `buildRow` functions SHALL remain explicit in the example
- **AND** those `buildRow` functions SHALL use explicit validation/defaulting for inventory fields

#### Scenario: Route handlers remain mostly unchanged

- **WHEN** a contributor reads `examples/inventory-json-polling/apps/server/src/index.ts`
- **THEN** sync route handler setup SHALL continue to pass repository methods to the existing Baresync server handlers
- **AND** scope authorization SHALL remain outside the Drizzle repository helper
