## MODIFIED Requirements

### Requirement: Inventory example uses paired config

The inventory example SHALL use `defineSyncConfig` with path-based `localSyncedSchema` and `apiSyncedSchema` inputs as its sync generator entrypoint.

#### Scenario: Inventory config is path-based and paired

- **WHEN** the inventory sync contract package runs its generator
- **THEN** it passes the local and API schema source file paths to `defineSyncConfig`
- **AND** it generates JSON artifacts through `defineSyncConfig`
- **AND** it does not require encoding-specific config naming

