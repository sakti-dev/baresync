## ADDED Requirements

### Requirement: Supported sync column helper functions

The `packages/baresync/src/schema/row-state.ts` module SHALL export `localSyncColumns()` and `apiSyncColumns()` helper functions for the supported Drizzle table shape.

`localSyncColumns()` SHALL return column definitions for:

- `deletedAt`: `text("deleted_at")`
- `createdAt`: `text("created_at").notNull().$defaultFn(() => new Date().toISOString())`
- `updatedAt`: `text("updated_at").notNull().$defaultFn(() => new Date().toISOString())`
- `isSynced`: `integer("is_synced", { mode: "boolean" }).notNull().default(false)`

`apiSyncColumns()` SHALL return column definitions for:

- `deletedAt`: `text("deleted_at")`
- `createdAt`: `text("created_at").notNull()`
- `updatedAt`: `text("updated_at").notNull()`
- `syncUpdatedAt`: `integer("sync_updated_at", { mode: "number" }).notNull()`

#### Scenario: Local sync columns integrate into a Drizzle table

- **WHEN** a consumer spreads `localSyncColumns()` into an `sqliteTable` definition
- **THEN** the resulting table has `deleted_at`, `created_at`, `updated_at`, and `is_synced` columns with the supported local sync shape

#### Scenario: API sync columns integrate into a Drizzle table

- **WHEN** a consumer spreads `apiSyncColumns()` into an `sqliteTable` definition
- **THEN** the resulting table has `deleted_at`, `created_at`, `updated_at`, and `sync_updated_at` columns with the supported API sync shape
