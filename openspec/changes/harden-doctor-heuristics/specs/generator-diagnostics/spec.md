## MODIFIED Requirements

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

### Requirement: Actionable warning diagnostic codes

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
