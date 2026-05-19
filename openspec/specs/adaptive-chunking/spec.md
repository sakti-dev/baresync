## ADDED Requirements

### Requirement: Per-row flattening for chunking
The push module SHALL support flattening table changes into per-row `PendingTablePush` units. Each unit SHALL contain exactly one changed row OR one deleted ID, plus the associated outbox IDs.

#### Scenario: Flatten a table with changed rows and deleted IDs
- **WHEN** a table has 3 changed rows and 2 deleted IDs
- **THEN** flattening SHALL produce 5 independent `PendingTablePush` units, each preserving its outbox ID mapping

### Requirement: Greedy bin-pack chunking
The push module SHALL support `chunk_pending_push_tables` that bin-packs per-row units into chunks respecting `max_rows` and `max_bytes` limits. Units SHALL be packed greedily — each unit is added to the current chunk if it fits, otherwise a new chunk is started.

#### Scenario: Large table splits across chunks
- **WHEN** a table has 2500 rows and `max_rows = 2000`
- **THEN** chunking SHALL produce two chunks: one with 2000 rows and one with 500 rows

#### Scenario: Chunk respects byte limit
- **WHEN** adding a row to the current chunk would exceed `max_bytes`
- **THEN** the row SHALL start a new chunk

#### Scenario: Single oversized row gets its own chunk
- **WHEN** a single row's encoded size exceeds `max_bytes`
- **THEN** it SHALL still be placed in its own chunk (handled by split-retry later)

### Requirement: Stack-based 413 split-retry loop
The push module SHALL use a stack-based retry loop. Each chunk is popped from the stack, sent to the server, and if a 413 response is received, the chunk SHALL be split in half and both halves pushed back onto the stack.

#### Scenario: 413 response triggers split-retry
- **WHEN** a chunk receives HTTP 413 and contains more than one row
- **THEN** the chunk SHALL be split into two halves, and both halves SHALL be pushed onto the stack with incremented retry count

#### Scenario: Single-row chunk returns error on 413
- **WHEN** a chunk receives HTTP 413 and contains exactly one row
- **THEN** the push SHALL fail with `SingleRowTooLarge` error

#### Scenario: Local hard limit check before send
- **WHEN** a chunk's encoded size exceeds the hard max bytes limit (2 MB) before sending
- **THEN** the chunk SHALL be split in half without sending, and both halves pushed onto the stack

### Requirement: Half-and-half split preserves outbox IDs
The `split_push_chunk_for_retry` function SHALL flatten the chunk into per-row units, split at the midpoint (`units.len() / 2`), and re-merge each half by table. Outbox ID mappings SHALL be preserved through the split.

#### Scenario: Split preserves outbox associations
- **WHEN** 4 rows are split into [2, 2]
- **THEN** each half SHALL retain the correct outbox ID mappings for its rows

### Requirement: Adaptive push integration with push function
The `push` function on `SyncEngine` SHALL use adaptive chunking: read outbox → flatten → bin-pack → stack-based send loop. The function SHALL return the combined `PushResult` from all chunks.

#### Scenario: Multiple chunks all succeed
- **WHEN** push has 3 chunks and all receive 200 OK
- **THEN** accepted IDs from all chunks SHALL be marked synced, and the combined result SHALL reflect all tables synced

#### Scenario: First chunk succeeds, second triggers split
- **WHEN** the first chunk succeeds but the second receives 413
- **THEN** the second chunk SHALL be split, retried, and the final result SHALL include all eventually-accepted rows
