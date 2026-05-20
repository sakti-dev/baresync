## Why

The baresync package and Rust crates exist as empty shells (Wave 1 complete). The next step is to prove an end-to-end JSON sync flow — from schema definition through local database, push, server validation, pull, and back — so that the core sync contract, encoding, and table-order semantics are validated before building out the full feature surface (protobuf, idempotency, chunking, reconciliation, diagnostics).

This is a thin vertical slice through Wave 2 of the PRD. It targets JSON-only, single-encoding sync with no adaptive chunking or reconciliation, but exercises every layer of the architecture.

## What Changes

- Add Drizzle row-state schema helpers (`defineSyncedTable`, `syncedTable`, `defineSyncContract`, `syncSchema`) with validation
- Add Rust core config, error, limits, and state types
- Extract local SQLite database runtime (connect, WAL, proxy commands, migration runner) into `baresync-core`
- Extract and generalize the sync contract generator to produce JSON contracts and FK-derived table order (no protobuf output yet)
- Add a generic push engine in `baresync-core` that reads outbox rows, builds JSON envelopes, and sends them using generated table order and generic scope resolution
- Add server push primitives (JSON decode/encode, envelope validation, table ordering, chunking constants) with no idempotency guard
- Add a generic pull engine in `baresync-core` that fetches JSON responses and applies upserts and soft deletes in FK-safe order
- Add shared JSON fixtures and both fake-HTTP and real-server integration tests proving round-trip parity between Rust client and JS server
- Remove all Sakti POS specific coupling: hardcoded table names (`SYNC_TABLES`), hardcoded scope resolution (`merchant_id`/`outlet_id`), protobuf-generated builders per table, and Sakti `AppState` dependencies

## Capabilities

### New Capabilities

- `schema-helpers`: Drizzle row-state column helpers, `defineSyncedTable`, `defineSyncContract`, `syncSchema`, and structural validation
- `local-database`: SQLite pool setup, Drizzle proxy commands (`run_sql`, `run_sql_batch`, `get_db_info`), embedded migration discovery and execution
- `json-sync-generator`: Contract generator that reads Drizzle schemas, computes FK-derived table order, and writes JSON contract output and table order constants
- `sync-push-client`: Generic push engine reading outbox in generated order, building JSON envelopes, resolving scope generically via `scopeId`
- `sync-pull-client`: Generic pull engine fetching JSON responses, applying upserts and soft deletes in FK-safe order with cursor advancement
- `server-push-primitives`: JSON request decode/response encode, push envelope validation (bytes, rows), table ordering helper, DB bind-parameter chunking constants

### Modified Capabilities

- `workspace-shells`: The empty stubs created in Wave 1 gain actual exports and implementations from the capabilities above

## Impact

- `packages/baresync/src/` — all subpath exports gain real implementations
- `crates/baresync-core/src/` — gains ~1500 LOC of extracted and generalized sync engine code
- `crates/tauri-plugin-baresync/src/` — gains DB command wrappers
- No changes to any existing Sakti POS app code (source is read-only reference at `openspec/external/sakti-pos/`)
- Shared JSON fixtures at `packages/baresync/fixtures/sync/` become the canonical protocol contract for both Rust and JS tests
