## ADDED Requirements

### Requirement: Inventory server demonstrates sync helper primitives

The inventory server repository SHALL use the public server helper primitives for cursor timestamp parsing, changed/deleted row splitting, pull table response construction, status changed-table detection, latest cursor formatting, and push table validation.

The example SHALL continue to keep inventory-specific Drizzle reads, Drizzle writes, row builders, seed data, and scope handling in app code.

#### Scenario: Repository uses helper primitives for pull responses

- **WHEN** a contributor reads `examples/inventory/apps/server/src/db/repository.ts`
- **THEN** pull response construction SHALL use the public helper for building pull table entries
- **AND** the repository SHALL NOT carry a custom local implementation of the same helper behavior

#### Scenario: Repository uses helper primitives for status responses

- **WHEN** a contributor reads `examples/inventory/apps/server/src/db/repository.ts`
- **THEN** status changed-table detection SHALL use the public helper for deriving changed table names
- **AND** the repository SHALL NOT carry a custom local implementation of the same helper behavior

#### Scenario: Repository keeps app-specific row mapping visible

- **WHEN** a contributor reads push handling in `examples/inventory/apps/server/src/db/repository.ts`
- **THEN** table-specific row builders and Drizzle write branches SHALL remain explicit in the example
