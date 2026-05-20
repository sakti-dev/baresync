## MODIFIED Requirements

### Requirement: Inventory server keeps both repository paths visible

The inventory example SHALL keep the primitive repository path in `examples/inventory/apps/server/src/db/primitive/sync-repository.ts` and `examples/inventory/apps/server/src/db/primitive/utils.ts` while also adding a helper-backed repository path in `examples/inventory/apps/server/src/db/drizzle-helper/sync-repository.ts` that uses the public Drizzle repository helper from `baresync/server/drizzle` for cursor timestamp parsing, changed/deleted row splitting, pull table response construction, status changed-table detection, latest cursor formatting, latest-cursor row selection, push table validation, and table-specific read/write callbacks.

The example SHALL continue to keep inventory-specific row validation, row defaults, seed data, route handlers, and scope handling in app code.

#### Scenario: Primitive repository remains available

- **WHEN** a contributor reads `examples/inventory/apps/server/src/db/primitive/sync-repository.ts`
- **THEN** the primitive inventory repository path SHALL remain available for comparison
- **AND** its local sync mechanics SHALL remain visible

#### Scenario: Helper-backed repository uses Drizzle helper for pull responses

- **WHEN** a contributor reads `examples/inventory/apps/server/src/db/drizzle-helper/sync-repository.ts`
- **THEN** pull response construction SHALL be delegated to the Drizzle repository helper
- **AND** the helper-backed repository SHALL NOT carry a custom local implementation of the same helper behavior

#### Scenario: Helper-backed repository uses Drizzle helper for status responses

- **WHEN** a contributor reads `examples/inventory/apps/server/src/db/drizzle-helper/sync-repository.ts`
- **THEN** status changed-table detection SHALL be delegated to the Drizzle repository helper
- **AND** the repository SHALL NOT carry a custom local implementation of the same helper behavior

#### Scenario: Helper-backed repository keeps app-specific row mapping visible

- **WHEN** a contributor reads table configuration in `examples/inventory/apps/server/src/db/drizzle-helper/sync-repository.ts`
- **THEN** table-specific `buildRow` functions SHALL remain explicit in the example
- **AND** those `buildRow` functions SHALL use explicit validation/defaulting for inventory fields

#### Scenario: Route handlers remain mostly unchanged

- **WHEN** a contributor reads `examples/inventory/apps/server/src/index.ts`
- **THEN** sync route handler setup SHALL continue to pass repository methods to the existing Baresync server handlers
- **AND** scope authorization SHALL remain outside the Drizzle repository helper
