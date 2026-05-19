## ADDED Requirements

### Requirement: Bun workspace package with subpath exports

The `packages/baresync` package SHALL be a Bun workspace member with
`"type": "module"` and the following subpath exports:

- `"."` → `src/index.ts`
- `"./schema"` → `src/schema/index.ts`
- `"./generator"` → `src/generator/index.ts`
- `"./db"` → `src/db/index.ts`
- `"./server"` → `src/server/index.ts`
- `"./tauri"` → `src/tauri/index.ts`
- `"./limits"` → `src/limits.ts`

The package SHALL define a `"bin"` entry `"baresync"` pointing to
`./src/cli.ts`.

#### Scenario: Package resolves all subpath exports

- **WHEN** a consumer imports from any baresync subpath (`baresync`,
  `baresync/schema`, `baresync/generator`, `baresync/db`, `baresync/server`,
  `baresync/tauri`, `baresync/limits`)
- **THEN** the import resolves without error (even if the module exports
  nothing yet)

#### Scenario: Package name uses internal alias

- **WHEN** the `package.json` is read
- **THEN** the `"name"` field is `"@repo/baresync"`

### Requirement: Sync limit constants exported from limits module

The `packages/baresync/src/limits.ts` module SHALL export four named constants:

- `DEFAULT_POS_TARGET_PUSH_BYTES` with value `262144` (256 KiB)
- `DEFAULT_API_MAX_PUSH_BYTES` with value `2097152` (2 MiB)
- `DEFAULT_MAX_PUSH_ROWS` with value `2000`
- `DEFAULT_DB_BIND_PARAMETER_BUDGET` with value `30000`

#### Scenario: Limits are importable from baresync/limits

- **WHEN** a consumer imports from `baresync/limits`
- **THEN** all four constants are available as named exports with the specified
  values

### Requirement: Empty module stubs for future extraction targets

The package SHALL contain empty re-export files at:

- `src/index.ts`
- `src/schema/index.ts`
- `src/generator/index.ts`
- `src/db/index.ts`
- `src/server/index.ts`
- `src/tauri/index.ts`
- `src/cli.ts`

Each stub file SHALL compile without error and export nothing.

#### Scenario: Stub modules compile cleanly

- **WHEN** `bun x ultracite check packages/baresync` is run
- **THEN** no compilation or lint errors are reported

### Requirement: TypeScript configuration

The package SHALL include a `tsconfig.json` that extends the project's shared
TypeScript config and includes the `src/` directory.

#### Scenario: TypeScript resolves package sources

- **WHEN** `tsc --noEmit` is run in `packages/baresync`
- **THEN** no type errors are reported
