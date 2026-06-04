## Purpose

Canonical fullstack inventory example for Baresync.

## Requirements

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

The example documentation MUST present JSON sync as the primary walkthrough path without referencing alternative encodings or an `encoding` configuration option.

#### Scenario: First-time user path is simple

- **WHEN** a new user reads the quick start
- **THEN** they can follow the example without needing transport implementation details first
- **AND** the example code does not include `encoding: "json"` in `createSyncClient`, `defineSyncConfig`, or handler factory calls

### Requirement: Example documentation entry point

The repository documentation MUST point new users to the create scaffolder as the recommended project starting point and to the inventory example as the canonical fullstack reference.

#### Scenario: User looks for a starter

- **WHEN** a user opens the docs or README looking for a way to start a new app
- **THEN** they are directed to the create scaffolder as the default new-project path
- **AND** they are directed to the inventory example as the richer fullstack reference implementation

#### Scenario: Manual setup remains available

- **WHEN** a user cannot use the create scaffolder or wants to wire an existing project
- **THEN** documentation SHALL still provide manual setup guidance for Tauri, server, and sync-contract integration

### Requirement: Inventory server keeps both repository paths visible

The inventory example SHALL keep the primitive repository path in `examples/inventory-json-polling/apps/server/src/db/v1/primitive/sync-repository.ts` and `examples/inventory-json-polling/apps/server/src/db/v1/primitive/utils.ts` while also keeping a helper-backed repository path in `examples/inventory-json-polling/apps/server/src/db/v1/drizzle-helper/sync-repository.ts` that uses the public Drizzle repository helper from `baresync/server/drizzle` for cursor timestamp parsing, changed/deleted row splitting, pull table response construction, status changed-table detection, latest cursor formatting, latest-cursor row selection, push table validation, and table-specific read/write callbacks.

The example SHALL continue to keep inventory-specific row validation, row defaults, seed data, route handlers, and scope handling in app code.

#### Scenario: Primitive repository remains available

- **WHEN** a contributor reads `examples/inventory-json-polling/apps/server/src/db/v1/primitive/sync-repository.ts`
- **THEN** the primitive inventory repository path SHALL remain available for comparison
- **AND** its local sync mechanics SHALL remain visible

#### Scenario: Helper-backed repository uses Drizzle helper for pull responses

- **WHEN** a contributor reads `examples/inventory-json-polling/apps/server/src/db/v1/drizzle-helper/sync-repository.ts`
- **THEN** pull response construction SHALL be delegated to the Drizzle repository helper
- **AND** the helper-backed repository SHALL NOT carry a custom local implementation of the same helper behavior

#### Scenario: Helper-backed repository uses Drizzle helper for status responses

- **WHEN** a contributor reads `examples/inventory-json-polling/apps/server/src/db/v1/drizzle-helper/sync-repository.ts`
- **THEN** status changed-table detection SHALL be delegated to the Drizzle repository helper
- **AND** the repository SHALL NOT carry a custom local implementation of the same helper behavior

#### Scenario: Helper-backed repository keeps app-specific row mapping visible

- **WHEN** a contributor reads table configuration in `examples/inventory-json-polling/apps/server/src/db/v1/drizzle-helper/sync-repository.ts`
- **THEN** table-specific `buildRow` functions SHALL remain explicit in the example
- **AND** those `buildRow` functions SHALL use explicit validation/defaulting for inventory fields

#### Scenario: Route handlers remain mostly unchanged

- **WHEN** a contributor reads `examples/inventory-json-polling/apps/server/src/index.ts`
- **THEN** sync route handler setup SHALL continue to pass repository methods to the existing Baresync server handlers
- **AND** scope authorization SHALL remain outside the Drizzle repository helper

### Requirement: Inventory example uses React Query for local reads

The inventory app SHALL use React Query for local Drizzle reads and sync state queries instead of interval polling.

#### Scenario: Inventory reads use React Query helper

- **WHEN** a contributor reads `examples/inventory-json-polling/apps/app/src/App.tsx`
- **THEN** locations, items, and stock count reads SHALL be fetched through the app's Baresync query hook
- **AND** those reads SHALL use stable inventory query keys

#### Scenario: Sync state uses React Query

- **WHEN** the sync panel reads local sync state or polling status
- **THEN** the app SHALL fetch that state through React Query
- **AND** it SHALL NOT rely on `setInterval` for routine refresh

### Requirement: Inventory example invalidates queries from plugin events

The inventory app SHALL listen to plugin events through its sync client provider and invalidate React Query keys instead of blindly polling.

#### Scenario: Data changed invalidates inventory and sync state

- **WHEN** the app receives `baresync://data-changed`
- **THEN** the sync client provider SHALL invalidate inventory data query keys
- **AND** it SHALL invalidate sync state query keys

#### Scenario: Sync status changed invalidates only sync state

- **WHEN** the app receives `baresync://sync-status-changed`
- **THEN** the sync client provider SHALL invalidate sync state query keys
- **AND** it SHALL NOT invalidate inventory table query keys only for a status event

#### Scenario: Event bridge is provider-owned

- **WHEN** a contributor reads the inventory app root component
- **THEN** the app SHALL NOT require a separate `useBaresyncEventBridge` call
- **AND** event listener lifecycle SHALL be owned by `SyncClientProvider`

### Requirement: Presentational inventory tables

Inventory table components SHALL receive data and rendering configuration rather than Drizzle query builders.

#### Scenario: App does not pass query builders to table components

- **WHEN** a contributor reads `examples/inventory-json-polling/apps/app/src/App.tsx`
- **THEN** table components SHALL be passed rows, loading state, errors, delete handlers, and column definitions
- **AND** table components SHALL NOT receive Drizzle query builders

#### Scenario: DataTable renders provided rows

- **WHEN** `DataTable` receives rows from a parent component
- **THEN** it SHALL render those rows without importing Drizzle query hooks or constructing SQL queries

### Requirement: Inventory example uses JS local write helpers

The inventory example SHALL use public JS sync client local write helpers for local row mutations that need sync outbox entries.

#### Scenario: Seed flow writes through transaction helper

- **WHEN** the inventory example creates sample location, item, and stock count rows
- **THEN** those row mutations SHALL run inside one `client.writeTransaction(db, callback)` call
- **AND** each row mutation SHALL be paired with exactly one `writeLocalChange` or `enqueueChange` call in that transaction

#### Scenario: Soft delete writes through transaction helper

- **WHEN** the inventory example soft-deletes one row from the UI
- **THEN** the row update and matching outbox enqueue SHALL run inside one `client.writeTransaction(db, callback)` call
- **AND** the outbox operation SHALL be `"update"`

### Requirement: Inventory example does not teach raw outbox insertion

The inventory example UI and write helpers SHALL NOT require components to import or insert into `syncOutbox` directly.

#### Scenario: Components use sync client write helpers

- **WHEN** a reader inspects inventory React components
- **THEN** local mutations SHALL use `client.writeLocalChange` or `client.enqueueChange`
- **AND** components SHALL NOT construct `sync_outbox` rows directly

#### Scenario: Sync bookkeeping is delegated

- **WHEN** a reader inspects inventory local write code
- **THEN** sync bookkeeping such as `tableName`, `scopeId`, `changedAt`, and outbox id SHALL be delegated to the JS sync client helper

### Requirement: Inventory app DB module groups schema tables

The inventory app SHALL keep its Tauri Drizzle database setup in `examples/inventory-json-polling/apps/app/src/lib/db.ts` and export schema table objects through a single `TABLE` object.

#### Scenario: DB module exports table registry

- **WHEN** a contributor reads `src/lib/db.ts`
- **THEN** the module SHALL export `TABLE` containing `locations`, `items`, `stockCounts`, `syncCursors`, and `syncOutbox`
- **AND** the Drizzle database schema SHALL be created from `TABLE`

#### Scenario: App code uses table registry

- **WHEN** app code imports schema table objects
- **THEN** it SHALL import `TABLE` from `src/lib/db.ts`
- **AND** table references SHALL make schema origin clear through `TABLE.<name>`

### Requirement: Inventory app embeds migrations from directory

The inventory app SHALL discover local SQLite migration SQL files from `src-tauri/migrations` at Rust build time and pass embedded migrations to the Baresync plugin.

#### Scenario: Build script discovers migrations

- **WHEN** a `.sql` file is added under `examples/inventory-json-polling/apps/app/src-tauri/migrations`
- **THEN** the app build script SHALL discover the file and include it in the generated embedded migration manifest

#### Scenario: React app does not run migrations explicitly

- **WHEN** the inventory React app starts
- **THEN** it SHALL start polling without first invoking a `run_migrations` command
- **AND** local migrations SHALL have been applied by the plugin setup path

### Requirement: Inventory example uses SYNC_SCOPE constant

The inventory example SHALL export `SYNC_SCOPE` from `packages/sync-contract/src/constants.ts` as the shared scope identifier used by both app and server.

#### Scenario: App imports SYNC_SCOPE

- **WHEN** the inventory app needs a scope ID for sync operations
- **THEN** it imports `SYNC_SCOPE` from `@sync-contract/constants`

#### Scenario: constants.ts only contains SYNC_SCOPE

- **WHEN** a contributor reads `packages/sync-contract/src/constants.ts`
- **THEN** it exports only `SYNC_SCOPE`
- **AND** it does not export `INVENTORY_SCOPE_ID` or `INVENTORY_PACKAGE_NAME`

### Requirement: Inventory example uses tsconfig path aliases

The inventory app and server SHALL use TypeScript `paths` aliases (`@sync-contract/*` → `src/*`, `@sync-contract/generated/*` → `generated/*`) instead of workspace package dependencies to resolve sync-contract imports.

#### Scenario: App uses path aliases for sync-contract imports

- **WHEN** the inventory app imports from sync-contract
- **THEN** it SHALL use `@sync-contract/*` import paths resolved by tsconfig paths

#### Scenario: Server uses path aliases for sync-contract imports

- **WHEN** the inventory server imports from sync-contract
- **THEN** it SHALL use `@sync-contract/*` import paths resolved by tsconfig paths

#### Scenario: No workspace dependency on sync-contract

- **WHEN** a contributor reads app or server package.json
- **THEN** they SHALL NOT find a workspace dependency on sync-contract

### Requirement: Inventory server versioned route organization

The inventory example server SHALL organize sync route handlers and sync repositories by contract version. Each version's code SHALL import from its matching generated dated directory.

#### Scenario: Server has versioned route files

- **WHEN** a contributor reads `apps/server/src/`
- **THEN** they find versioned route files under `v1/` (or equivalent) containing `createSyncPushHandler`, `createSyncPullHandler`, `createSyncStatusHandler` for that version

#### Scenario: Server has versioned sync repositories

- **WHEN** a contributor reads `apps/server/src/db/`
- **THEN** they find versioned sync repository files under `v1/` (or equivalent) containing drizzle queries that import schema tables from the matching generated directory

#### Scenario: Shared DB client is not duplicated

- **WHEN** a contributor reads the server structure
- **THEN** `db/client.ts` is shared across versions and is not inside a versioned directory

#### Scenario: Index registers versioned routes

- **WHEN** a contributor reads `apps/server/src/index.ts`
- **THEN** it registers routes with version-prefixed paths (e.g. `/api/sync/v1/push`)
- **AND** each version's routes delegate to its versioned route module

### Requirement: Inventory server route paths are versioned

The inventory example server SHALL expose sync endpoints under versioned paths.

#### Scenario: Sync endpoints are under /api/v1/

- **WHEN** the inventory server starts
- **THEN** sync push, pull, and status endpoints are available at `/api/sync/v1/push`, `/api/sync/v1/pull`, `/api/sync/v1/status`

### Requirement: Inventory example uses paired config

The inventory example SHALL use `defineSyncConfig` with path-based `localSyncedSchema` and `apiSyncedSchema` inputs as its sync generator entrypoint.

#### Scenario: Inventory config is path-based and paired

- **WHEN** the inventory sync contract package runs its generator
- **THEN** it passes the local and API schema source file paths to `defineSyncConfig`
- **AND** it generates JSON artifacts through `defineSyncConfig`
- **AND** it does not require encoding-specific config naming
