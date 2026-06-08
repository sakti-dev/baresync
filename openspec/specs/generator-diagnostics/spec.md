## Purpose

Diagnostics for Baresync sync contracts and the `baresync doctor` CLI behavior.

## Requirements

### Requirement: Structured diagnostics model

The `packages/baresync/src/generator/diagnostics.ts` module SHALL export a `SyncDiagnostic` type and a `runDiagnostics(contract, options?)` function. Each diagnostic SHALL have: `code`, `severity` (`"error"` | `"warning"` | `"info"`), `message`, optional `table`, optional `column`, `why`, `fix`, and optional `docs`.

Diagnostics SHALL emit a warning only when the available contract or paired-schema metadata can establish the warned condition. Checks that require API-side metadata SHALL use the paired API table when paired diagnostic context is available.

#### Scenario: runDiagnostics returns error for missing primary key

- **WHEN** a synced table has no primary key column named `id`
- **THEN** a diagnostic SHALL be returned with `code: "SYNC_SCHEMA_MISSING_PRIMARY_KEY"`, `severity: "error"`, and an actionable `fix`

#### Scenario: Paired diagnostics accept a valid scope-watermark index

- **WHEN** a paired API table has an index whose first columns are the configured scope column followed by `sync_updated_at`
- **THEN** `SYNC_INDEX_MISSING_SCOPE_WATERMARK` SHALL NOT be returned for that table

#### Scenario: Paired diagnostics warn for a missing scope-watermark index

- **WHEN** a paired API table has no index whose first columns are the configured scope column followed by `sync_updated_at`
- **THEN** a diagnostic SHALL be returned with `code: "SYNC_INDEX_MISSING_SCOPE_WATERMARK"` and `severity: "warning"`

#### Scenario: Scope-watermark index permits trailing columns

- **WHEN** a paired API table has an index ordered as `(scope_column, sync_updated_at, id)`
- **THEN** `SYNC_INDEX_MISSING_SCOPE_WATERMARK` SHALL NOT be returned for that table

#### Scenario: Unavailable API metadata does not produce an inferred warning

- **WHEN** `runDiagnostics` receives a lower-level contract table that does not physically contain `sync_updated_at` and no paired API context
- **THEN** it SHALL NOT emit `SYNC_INDEX_MISSING_SCOPE_WATERMARK` for that table

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

The diagnostics system SHALL detect and report the following warning codes when their conditions are established: `SYNC_INDEX_MISSING_SCOPE_WATERMARK`, `SYNC_SCHEMA_NULLABLE_SCOPE_COLUMN`, `SYNC_SCHEMA_LARGE_TEXT_FIELD`, `SYNC_SCHEMA_JSON_ONLY_FIELD`, `SYNC_SCHEMA_BATTERIES_INCLUDED_COMPLEX_MAPPING`, `SYNC_SCHEMA_BATTERIES_INCLUDED_NOT_1_TO_1`, and `SYNC_COMPAT_ADDITIVE_CHANGE`.

The diagnostics system SHALL NOT emit `SYNC_INDEX_MISSING_LOCAL_DIRTY`, `SYNC_SCHEMA_NO_CONFLICT_STRATEGY`, or `SYNC_SCHEMA_NO_DELETE_STRATEGY`.

#### Scenario: Nullable scope column warned

- **WHEN** a synced table's scope column is nullable
- **THEN** `SYNC_SCHEMA_NULLABLE_SCOPE_COLUMN` warning SHALL be returned

#### Scenario: Outbox-backed dirty tracking does not require a table index warning

- **WHEN** a local synced table contains `is_synced` with or without an index
- **THEN** `SYNC_INDEX_MISSING_LOCAL_DIRTY` SHALL NOT be returned

#### Scenario: Missing unsupported strategies do not warn

- **WHEN** a synced table does not define lower-level conflict or delete strategy metadata
- **THEN** neither `SYNC_SCHEMA_NO_CONFLICT_STRATEGY` nor `SYNC_SCHEMA_NO_DELETE_STRATEGY` SHALL be returned

### Requirement: Paired one-to-one mapping diagnostics

The diagnostics system SHALL treat the standard local-only `isSynced` / `is_synced` column and server-only `syncUpdatedAt` / `sync_updated_at` column as expected built-in paired-schema differences.

`SYNC_SCHEMA_BATTERIES_INCLUDED_NOT_1_TO_1` SHALL be returned only when, after excluding those built-in columns, a table has at least one additional local-only column and at least one additional server-only column.

#### Scenario: Default paired built-ins do not warn

- **WHEN** a paired table has only `isSynced` as local-only metadata and `syncUpdatedAt` as server-only metadata
- **THEN** `SYNC_SCHEMA_BATTERIES_INCLUDED_NOT_1_TO_1` SHALL NOT be returned

#### Scenario: Snake-case built-in aliases do not warn

- **WHEN** a paired table records only `is_synced` as local-only metadata and `sync_updated_at` as server-only metadata
- **THEN** `SYNC_SCHEMA_BATTERIES_INCLUDED_NOT_1_TO_1` SHALL NOT be returned

#### Scenario: Additional one-sided business columns warn

- **WHEN** a paired table has an additional local-only business column and an additional server-only business column after built-ins are excluded
- **THEN** `SYNC_SCHEMA_BATTERIES_INCLUDED_NOT_1_TO_1` SHALL be returned with an actionable explanation

### Requirement: Paired doctor uses both schema sides

For paired sync configuration, `baresync doctor`, `baresync generate --check`, and generation diagnostics SHALL load each configured local/API table pair once and SHALL provide both sides to diagnostics. Runtime contract generation SHALL continue to derive table metadata and ordering from local tables, and generated contract files SHALL NOT include Drizzle table or index objects.

#### Scenario: Doctor validates API index metadata

- **WHEN** `baresync doctor` loads a paired config whose API table declares the required scope-watermark index
- **THEN** doctor SHALL evaluate that API table's index metadata
- **AND** it SHALL NOT report the index as missing

#### Scenario: Generated contract shape remains unchanged

- **WHEN** paired generation completes after diagnostic context is added
- **THEN** generated contract table entries SHALL continue to contain columns, scope, local-only columns, and server-only columns
- **AND** they SHALL NOT contain local table, API table, or index metadata

### Requirement: Multi-table diagnostic regression fixture

The generator test suite SHALL provide a reusable paired-schema fixture containing multiple tables with distinct table names and scope columns. The fixture SHALL include valid indexed tables and at least one table intentionally missing the API scope-watermark index.

Regression tests SHALL run diagnostics across the complete fixture rather than testing every heuristic only with isolated one-table contracts.

#### Scenario: Valid tables remain warning-free in a mixed fixture

- **WHEN** diagnostics run against the complete multi-table fixture
- **THEN** each table with its own valid API scope-watermark index SHALL NOT receive `SYNC_INDEX_MISSING_SCOPE_WATERMARK`
- **AND** default paired built-in column differences SHALL NOT produce heuristic warnings

#### Scenario: Invalid table receives only its own index warning

- **WHEN** one API table in the multi-table fixture lacks its required scope-watermark index
- **THEN** `SYNC_INDEX_MISSING_SCOPE_WATERMARK` SHALL identify that table
- **AND** the warning SHALL NOT be attributed to any valid table in the fixture

#### Scenario: Removed warnings stay absent across all fixture tables

- **WHEN** diagnostics run against every table in the multi-table fixture
- **THEN** no table SHALL receive `SYNC_INDEX_MISSING_LOCAL_DIRTY`, `SYNC_SCHEMA_NO_CONFLICT_STRATEGY`, or `SYNC_SCHEMA_NO_DELETE_STRATEGY`

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
