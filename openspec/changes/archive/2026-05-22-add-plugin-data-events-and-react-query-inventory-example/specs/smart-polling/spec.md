## ADDED Requirements

### Requirement: Plugin data change event
The plugin SHALL emit `baresync://data-changed` when sync or SQL activity changes local observable data.

#### Scenario: Pull-applied rows emit data changed
- **WHEN** a polling or manual sync pull applies one or more changed rows or deleted ids locally
- **THEN** the plugin SHALL emit `baresync://data-changed`
- **AND** the event payload SHALL include the scope id and source of the change

#### Scenario: Push-cleared outbox emits data changed
- **WHEN** a polling or manual sync push accepts one or more local rows and clears local outbox or sync metadata
- **THEN** the plugin SHALL emit `baresync://data-changed`
- **AND** the event payload SHALL include the scope id and source of the change

#### Scenario: No-op sync does not emit data changed
- **WHEN** a polling or manual sync completes without applying rows, deleting rows, or clearing accepted outbox rows
- **THEN** the plugin SHALL NOT emit `baresync://data-changed`

### Requirement: Plugin sync status event
The plugin SHALL emit `baresync://sync-status-changed` when polling or sync status changes independently of local data changes.

#### Scenario: Sync completion emits status changed
- **WHEN** a polling or manual sync completes successfully
- **THEN** the plugin SHALL emit `baresync://sync-status-changed`
- **AND** consumers SHALL be able to refetch polling status without refetching all local data queries

#### Scenario: Pause and resume emit status changed
- **WHEN** polling is paused or resumed through commands or app lifecycle handling
- **THEN** the plugin SHALL emit `baresync://sync-status-changed`

#### Scenario: Stop polling emits status changed
- **WHEN** polling is stopped
- **THEN** the plugin SHALL emit `baresync://sync-status-changed`
