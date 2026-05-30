## Purpose

Diagnostics for Baresync sync contracts and the `baresync doctor` CLI behavior.

## Requirements

### Requirement: Structured diagnostics model

The `packages/baresync/src/generator/diagnostics.ts` module SHALL export a `SyncDiagnostic` type and a `runDiagnostics(contract)` function. Each diagnostic SHALL have: `code`, `severity` (`"error"` | `"warning"` | `"info"`), `message`, optional `table`, optional `column`, `why`, `fix`, and optional `docs`.

#### Scenario: runDiagnostics returns error for missing primary key

- **WHEN** a synced table has no primary key column named `id`
- **THEN** a diagnostic SHALL be returned with `code: "SYNC_SCHEMA_MISSING_PRIMARY_KEY"`, `severity: "error"`, and an actionable `fix`

#### Scenario: runDiagnostics returns warning for missing sync index

- **WHEN** a scoped table has no index on `(scopeColumn, syncUpdatedAt, id)`
- **THEN** a diagnostic SHALL be returned with `code: "SYNC_INDEX_MISSING_SCOPE_WATERMARK"`, `severity: "warning"`

### Requirement: All 15 error diagnostic codes

The diagnostics system SHALL detect and report all of the following error codes: `SYNC_SCHEMA_MISSING_PRIMARY_KEY`, `SYNC_SCHEMA_UNSUPPORTED_PRIMARY_KEY`, `SYNC_SCHEMA_MISSING_SCOPE_COLUMN`, `SYNC_SCHEMA_MISSING_ROW_STATE_COLUMN`, `SYNC_SCHEMA_MISSING_DELETED_AT`, `SYNC_SCHEMA_MISSING_SYNC_UPDATED_AT`, `SYNC_SCHEMA_MISSING_LOCAL_IS_SYNCED`, `SYNC_SCHEMA_REQUIRED_EXTERNAL_FK`, `SYNC_SCHEMA_FK_CYCLE`, `SYNC_SCHEMA_UNSUPPORTED_COLUMN_TYPE`, `SYNC_SCHEMA_DUPLICATE_TABLE_NAME`, `SYNC_SCHEMA_DUPLICATE_FIELD_NAME`, `SYNC_SCHEMA_RESERVED_FIELD_REUSED`, `SYNC_SCHEMA_ENCODING_UNSUPPORTED`.

#### Scenario: Missing deleted_at detected

- **WHEN** a synced table lacks a `deletedAt` column
- **THEN** `SYNC_SCHEMA_MISSING_DELETED_AT` error SHALL be returned with the table name and a fix suggesting the column

#### Scenario: FK cycle detected

- **WHEN** synced tables form a foreign-key cycle
- **THEN** `SYNC_SCHEMA_FK_CYCLE` error SHALL be returned identifying the cycle

#### Scenario: Required external FK detected

- **WHEN** a synced table has a required FK to a non-synced table
- **THEN** `SYNC_SCHEMA_REQUIRED_EXTERNAL_FK` error SHALL be returned

### Requirement: All 9 warning diagnostic codes

The diagnostics system SHALL detect and report all of the following warning codes: `SYNC_INDEX_MISSING_SCOPE_WATERMARK`, `SYNC_INDEX_MISSING_LOCAL_DIRTY`, `SYNC_SCHEMA_NULLABLE_SCOPE_COLUMN`, `SYNC_SCHEMA_NO_CONFLICT_STRATEGY`, `SYNC_SCHEMA_NO_DELETE_STRATEGY`, `SYNC_SCHEMA_LARGE_TEXT_FIELD`, `SYNC_SCHEMA_JSON_ONLY_FIELD`, `SYNC_SCHEMA_BATTERIES_INCLUDED_COMPLEX_MAPPING`, `SYNC_COMPAT_ADDITIVE_CHANGE`.

#### Scenario: Nullable scope column warned

- **WHEN** a synced table's scope column is nullable
- **THEN** `SYNC_SCHEMA_NULLABLE_SCOPE_COLUMN` warning SHALL be returned

### Requirement: Diagnostics block generation on error

`generateSyncArtifacts` SHALL call `runDiagnostics` before writing files. If any diagnostic has `severity: "error"`, generation SHALL stop and all diagnostics SHALL be printed. No output files SHALL be written.

#### Scenario: Generation blocked by errors

- **WHEN** `generateSyncArtifacts` is called with a contract that has missing scope columns
- **THEN** no files SHALL be written and all error diagnostics SHALL be printed

#### Scenario: Generation proceeds with warnings only

- **WHEN** `generateSyncArtifacts` is called with a contract that has only warnings (missing indexes)
- **THEN** all warnings SHALL be printed and generation SHALL proceed normally

### Requirement: baresync doctor CLI command

The CLI SHALL support `baresync doctor` that runs diagnostics without generating files.

The command SHALL support these config path sources, in precedence order:

1. `--config <path>`
2. Positional config path
3. Auto-discovered config in the current working directory

When auto-discovering config, the command SHALL search the current working directory for:

- `sync.config.ts`
- `sync.config.mts`
- `sync.config.js`
- `sync.config.mjs`

The command SHALL run diagnostics for every recognized config export that contains a sync contract:

- `syncGeneratorConfig`
- recognized default export
- legacy `contract` export

#### Scenario: Doctor reports errors

- **WHEN** `baresync doctor` is run with a contract that has errors
- **THEN** all diagnostics SHALL be printed with exit code 1

#### Scenario: Doctor reports only warnings

- **WHEN** `baresync doctor` is run with a valid contract
- **THEN** all diagnostics SHALL be printed with exit code 0

#### Scenario: Doctor discovers sync config

- **WHEN** `baresync doctor` is run without a config path from a directory containing `sync.config.ts`
- **THEN** the CLI loads that config file
- **AND** it prints diagnostics for each recognized config export with a contract

#### Scenario: Doctor supports config flag

- **WHEN** `baresync doctor --config ./custom-sync.config.ts` is run
- **THEN** the CLI loads `./custom-sync.config.ts`
- **AND** it does not attempt auto-discovery

### Requirement: baresync generate --check

The CLI SHALL support `baresync generate --check <config-path>` that runs generation in dry-run mode, checking if output files would change without writing them.

#### Scenario: --check detects stale files

- **WHEN** generated files are outdated compared to the contract
- **THEN** `--check` SHALL report stale files and exit with code 1

### Requirement: baresync generate --warnings-as-errors

The CLI SHALL support `--warnings-as-errors` flag that treats all warnings as errors, blocking generation.

#### Scenario: Warnings block generation with flag

- **WHEN** `--warnings-as-errors` is set and warnings exist
- **THEN** generation SHALL be blocked as if they were errors

### Requirement: sync-contract.manifest.json output

`generateSyncArtifacts` SHALL write a `sync-contract.manifest.json` file alongside generated artifacts. The manifest SHALL contain: `contractVersion`, `generatorVersion`, `encoding`, `tables` (names and fields), `scopeMappings`, `tableOrder`, and `outputPaths`.

#### Scenario: Manifest written on successful generation

- **WHEN** generation succeeds
- **THEN** a `sync-contract.manifest.json` SHALL be written with contract metadata

#### Scenario: Manifest includes table order

- **WHEN** the contract has tables `[products, categories]` with a category→product FK
- **THEN** the manifest `tableOrder.upsert` SHALL be `["categories", "products"]` and `tableOrder.delete` SHALL be `["products", "categories"]`
