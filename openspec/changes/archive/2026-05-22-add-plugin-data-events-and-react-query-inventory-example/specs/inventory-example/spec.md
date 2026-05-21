## ADDED Requirements

### Requirement: React Query inventory reads
The inventory app SHALL use React Query for local Drizzle reads and sync state queries.

#### Scenario: Inventory data hooks own queries
- **WHEN** a contributor reads the inventory app data layer
- **THEN** locations, items, and stock count reads SHALL be exposed through custom hooks that own React Query keys and Drizzle query functions

#### Scenario: Sync state uses React Query
- **WHEN** the sync panel reads local sync state or polling status
- **THEN** the app SHALL fetch that state through React Query instead of interval polling

### Requirement: Event-driven React Query invalidation
The inventory app SHALL listen to plugin events and invalidate React Query keys instead of blindly polling on an interval.

#### Scenario: Data changed invalidates inventory queries
- **WHEN** the app receives `baresync://data-changed`
- **THEN** the app SHALL invalidate inventory data query keys
- **AND** visible inventory tables SHALL refetch through React Query

#### Scenario: Sync status changed invalidates sync state
- **WHEN** the app receives `baresync://sync-status-changed`
- **THEN** the app SHALL invalidate sync state query keys
- **AND** inventory table queries SHALL NOT be invalidated only for a status event

#### Scenario: No interval polling for inventory reads
- **WHEN** the inventory app is running normally
- **THEN** local inventory reads and sync state reads SHALL NOT rely on `setInterval` for routine refresh

### Requirement: Presentational inventory tables
Inventory table components SHALL receive data and rendering configuration rather than Drizzle query builders.

#### Scenario: App does not pass query builders to table components
- **WHEN** a contributor reads `examples/inventory-json-polling/apps/app/src/App.tsx`
- **THEN** table components SHALL be passed rows, loading state, and column definitions
- **AND** Drizzle query construction SHALL live in custom data hooks

#### Scenario: DataTable renders provided rows
- **WHEN** `DataTable` receives rows from a parent component
- **THEN** it SHALL render those rows without importing Drizzle query hooks or constructing SQL queries
