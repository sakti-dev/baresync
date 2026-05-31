## MODIFIED Requirements

### Requirement: Inventory example uses paired config

The inventory example SHALL use `defineSyncConfig` with `localSyncedSchema` and `apiSyncedSchema` as its sync generator entrypoint.

The `sync.config.ts` SHALL NOT include a `packageName` field.

#### Scenario: Inventory config is JSON-first and paired without packageName

- **WHEN** the inventory sync contract package runs its generator
- **THEN** it imports both local and API synced schema modules
- **AND** it generates JSON artifacts through `defineSyncConfig`
- **AND** `defineSyncConfig` is called without `packageName`
- **AND** it does not require encoding-specific config naming

## ADDED Requirements

### Requirement: Inventory example uses SYNC_SCOPE constant

The inventory example SHALL export `SYNC_SCOPE` from `packages/sync-contract/src/constants.ts` as the shared scope identifier used by both app and server.

#### Scenario: App imports SYNC_SCOPE

- **WHEN** the inventory app needs a scope ID for sync operations
- **THEN** it imports `SYNC_SCOPE` from `@example/inventory-sync-contract/constants`

#### Scenario: constants.ts only contains SYNC_SCOPE

- **WHEN** a contributor reads `packages/sync-contract/src/constants.ts`
- **THEN** it exports only `SYNC_SCOPE`
- **AND** it does not export `INVENTORY_SCOPE_ID` or `INVENTORY_PACKAGE_NAME`

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
- **THEN** it registers routes with version-prefixed paths (e.g. `/api/v1/sync/push`)
- **AND** each version's routes delegate to its versioned route module

### Requirement: Inventory server route paths are versioned

The inventory example server SHALL expose sync endpoints under versioned paths.

#### Scenario: Sync endpoints are under /api/v1/

- **WHEN** the inventory server starts
- **THEN** sync push, pull, and status endpoints are available at `/api/v1/sync/push`, `/api/v1/sync/pull`, `/api/v1/sync/status`

## REMOVED Requirements

### Requirement: INVENTORY_SCOPE_ID and INVENTORY_PACKAGE_NAME constants
**Reason**: `INVENTORY_PACKAGE_NAME` is a protobuf remnant (protobuf support dropped). `INVENTORY_SCOPE_ID` renamed to `SYNC_SCOPE` for domain-neutrality.
**Migration**: Replace `INVENTORY_SCOPE_ID` with `SYNC_SCOPE`. Remove all references to `INVENTORY_PACKAGE_NAME`.

### Requirement: Unversioned sync endpoints
**Reason**: Replaced by versioned paths (`/api/v1/sync/...`) to support multi-version coexistence.
**Migration**: Update client to use `/api/v1/sync/...` paths instead of `/sync/...`.
