## MODIFIED Requirements

### Requirement: Empty module stubs for future extraction targets

The package SHALL contain files at:

- `src/index.ts` — re-exports from `./schema`, `./generator`, `./db`, `./limits`
- `src/schema/index.ts` — re-exports `localSyncRowState`, `apiSyncRowState`, `defineSyncedTable`, `syncedTable`, `defineSyncContract`, `syncSchema`, `syncServerSchema`
- `src/generator/index.ts` — exports `generateSyncArtifacts`
- `src/db/index.ts` — re-exports from `./drizzle-proxy` and `./migrations`
- `src/db/drizzle-proxy.ts` — exports `createTauriDrizzleDatabase`
- `src/db/migrations.ts` — exports migration helper types
- `src/server/index.ts` — re-exports from `./service` and `./chunking`
- `src/server/service.ts` — exports `decodeSyncRequest`, `encodeSyncResponse`, `validatePushEnvelope`, `orderPushChanges`
- `src/server/chunking.ts` — exports chunking constants and utilities
- `src/tauri/index.ts` — empty stub (unchanged, Wave 3)
- `src/cli.ts` — supports `baresync generate` command
- `src/limits.ts` — unchanged

Each file SHALL compile without error and export the symbols listed above.

#### Scenario: All subpath exports resolve with real symbols

- **WHEN** a consumer imports from `baresync/schema`
- **THEN** `defineSyncedTable`, `syncedTable`, `defineSyncContract`, `syncSchema`, `localSyncRowState`, `apiSyncRowState`, and `syncServerSchema` are available as named exports

#### Scenario: Generator subpath exports generate function

- **WHEN** a consumer imports from `baresync/generator`
- **THEN** `generateSyncArtifacts` is available as a named export

#### Scenario: Server subpath exports primitives

- **WHEN** a consumer imports from `baresync/server`
- **THEN** `decodeSyncRequest`, `encodeSyncResponse`, `validatePushEnvelope`, `orderPushChanges`, and chunking utilities are available as named exports

#### Scenario: DB subpath exports Drizzle helper

- **WHEN** a consumer imports from `baresync/db`
- **THEN** `createTauriDrizzleDatabase` is available as a named export

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
