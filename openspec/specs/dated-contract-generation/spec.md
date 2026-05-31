## Purpose

Versioned contract output using ISO-dated directories with frozen schema snapshots.

## Requirements

### Requirement: Dated output directory generation

The generator SHALL write all output artifacts to a dated subdirectory under `outputDir`, using the current date in `YYYY-MM-DD` format.

#### Scenario: First generation creates dated directory

- **WHEN** `generateSyncArtifacts` is called with `outputDir: "./generated"` on 2026-06-01
- **THEN** artifacts are written to `./generated/2026-06-01/`
- **AND** the directory is created if it does not exist

#### Scenario: Same-day regeneration overwrites existing output

- **WHEN** `generateSyncArtifacts` is called and `./generated/2026-06-01/` already exists
- **THEN** the artifacts in that directory are overwritten
- **AND** no error or warning is produced

#### Scenario: Different-day generation creates new directory without touching old

- **WHEN** `generateSyncArtifacts` is called on 2026-06-15 and `./generated/2026-06-01/` already exists
- **THEN** a new directory `./generated/2026-06-15/` is created
- **AND** the previous `./generated/2026-06-01/` directory is untouched

### Requirement: ISO date contract version

The generated `sync-contract.manifest.json` SHALL use an ISO date string (`YYYY-MM-DD`) as the `contractVersion` value, derived from the generation date.

#### Scenario: Manifest contains date version

- **WHEN** generation runs on 2026-06-01
- **THEN** `sync-contract.manifest.json` contains `"contractVersion": "2026-06-01"`

### Requirement: All generated artifacts in dated directory

All generator output files (`sync-contract.json`, `sync-contract.manifest.json`, `sync-table-order.ts`) SHALL be written inside the dated subdirectory.

#### Scenario: All files in dated directory

- **WHEN** generation runs on 2026-06-01 with `outputDir: "./generated"`
- **THEN** `./generated/2026-06-01/sync-contract.json` exists
- **AND** `./generated/2026-06-01/sync-contract.manifest.json` exists
- **AND** `./generated/2026-06-01/sync-table-order.ts` exists
- **AND** no files are written to `./generated/` directly

### Requirement: Schema snapshot in generated output

The generator SHALL copy the source schema files (`api-synced-schema.ts`, `local-synced-schema.ts`) into the generated dated directory alongside the contract artifacts. These copies SHALL be frozen snapshots of the current schema at generation time.

#### Scenario: Schema files are copied to generated directory

- **WHEN** generation runs on 2026-06-01 with `outputDir: "./generated"` and the config references `src/api-synced-schema.ts` and `src/local-synced-schema.ts`
- **THEN** `./generated/2026-06-01/api-synced-schema.ts` exists
- **AND** `./generated/2026-06-01/local-synced-schema.ts` exists
- **AND** their contents match the source files at generation time

#### Scenario: Frozen schema survives source edit

- **WHEN** generation ran on 2026-05-15 and then the user edits `src/api-synced-schema.ts`
- **THEN** `./generated/2026-05-15/api-synced-schema.ts` is unchanged
- **AND** only a new generation would produce an updated snapshot

#### Scenario: Schema snapshot enables multi-version compilation

- **WHEN** the user has two generated versions `2026-05-15/` and `2026-06-01/` with different column definitions
- **THEN** server v1 code importing from `generated/2026-05-15/api-synced-schema` compiles against v1 columns
- **AND** server v2 code importing from `generated/2026-06-01/api-synced-schema` compiles against v2 columns
- **AND** both compile without TypeScript errors
