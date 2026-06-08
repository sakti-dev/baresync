## MODIFIED Requirements

### Requirement: Sync cursor server helpers

The `packages/baresync/src/server/service.ts` module SHALL export `parseSyncCursor`, `formatSyncCursor`, and `formatSyncWatermarkCursor` for cursor parsing and formatting using the `"sync:timestamp:tableName:rowId"` wire format.

`formatSyncWatermarkCursor(syncUpdatedAt)` SHALL return a valid cursor with table name `"__watermark__"` and row id `"__scope__"`. The timestamp SHALL be the server observation timestamp supplied by the caller.

#### Scenario: Cursor parsed and formatted roundtrip

- **WHEN** a cursor is formatted and then parsed
- **THEN** the original values SHALL be recovered

#### Scenario: Synthetic watermark cursor is formatted

- **WHEN** `formatSyncWatermarkCursor` is called with timestamp `1780915200000`
- **THEN** it SHALL return `"sync:1780915200000:__watermark__:__scope__"`

#### Scenario: Synthetic watermark cursor parses as normal cursor

- **WHEN** `parseSyncCursor` is called with `"sync:1780915200000:__watermark__:__scope__"`
- **THEN** it SHALL return `syncUpdatedAt: 1780915200000`, `tableName: "__watermark__"`, and `rowId: "__scope__"`
