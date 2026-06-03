## MODIFIED Requirements

### Requirement: Schema snapshot in generated output

The generator SHALL copy the source schema files (`api-synced-schema.ts`, `local-synced-schema.ts`) referenced by the paired config into the generated dated directory alongside the contract artifacts. These copies SHALL be frozen snapshots of the current schema at generation time.

#### Scenario: Schema files are copied to generated directory

- **WHEN** generation runs on 2026-06-01 with `outputDir: "./generated"` and the config points at `./src/api-synced-schema.ts` and `./src/local-synced-schema.ts`
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

