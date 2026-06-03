## Purpose

Path-based paired schema configuration for the generator, replacing imported namespace objects with explicit file paths.

## Requirements

### Requirement: Path-based paired schema configuration

The `defineSyncConfig` function SHALL accept `apiSyncedSchema` and `localSyncedSchema` as paths to the schema source files, load those schema modules at runtime, and use them to validate paired tables and generate dated snapshots.

#### Scenario: Config accepts explicit schema file paths

- **WHEN** `defineSyncConfig` is called with `apiSyncedSchema: "./src/api-synced-schema.ts"` and `localSyncedSchema: "./src/local-synced-schema.ts"`
- **THEN** it returns a generator config that can be passed to `generateSyncArtifacts`
- **AND** the generator can resolve both schema modules from those paths

#### Scenario: Missing schema file path fails fast

- **WHEN** `defineSyncConfig` is called with a path that does not resolve to a schema module
- **THEN** it throws a descriptive error naming the missing file
