## Context

Wave 1 created empty `packages/baresync` and `crates/baresync-core` / `crates/tauri-plugin-baresync` shells with `limits.ts` constants and empty Rust files. The Sakti POS source at `docs/external/sakti-pos/` contains ~8,000 lines of working sync code across four areas:

- **Generator** (`packages/sync-proto-generator/src/`, ~1,600 LOC): Reads Drizzle schemas, computes FK-derived table order, writes protobuf artifacts and Rust/TS mappers.
- **Rust sync engine** (`apps/pos-app/src-tauri/src/sync/`, ~4,300 LOC): Outbox, push, pull, reconciliation, all tightly coupled to protobuf-generated per-table builders and hardcoded Sakti table names (`SYNC_TABLES`).
- **Rust DB layer** (`apps/pos-app/src-tauri/src/db/`, ~600 LOC): SQLite pool setup, Drizzle proxy commands, embedded migration runner. The most extractable code.
- **Server sync** (`apps/api/src/sync/`, ~2,500 LOC): Push validation, chunking, idempotency, service logic. Deeply tied to Sakti's Elysia framework, specific table schemas, and protobuf encoding.

This thin vertical slices through all four areas but targets **JSON-only, no chunking, no idempotency, no reconciliation** to prove the architecture before filling in the full feature surface.

## Goals / Non-Goals

**Goals:**

- Prove an end-to-end JSON sync flow: schema definition → generate contract → local DB → push → server validate → pull → apply rows
- Establish the agnostic type contracts that both Rust and JS consume identically (JSON envelope shape, table order, scope resolution)
- Replace all Sakti-specific coupling (hardcoded tables, protobuf builders, `merchant_id`/`outlet_id` scope, `AppState`) with generic, config-driven equivalents
- Create shared JSON fixtures that both Rust and JS tests consume to catch protocol drift
- Validate the extraction approach on the simplest complete flow before building complex features on top

**Non-Goals:**

- Protobuf encoding (deferred to full Wave 2 Stream A)
- Adaptive chunking / 413 split retry (deferred)
- Idempotency guard (deferred to full Wave 2 Stream C)
- Batteries-included server (deferred to full Wave 2 Stream C)
- Reconciliation / server-wins conflict resolution (deferred to full Wave 2 Stream B)
- Client identity tracking (deferred)
- Diagnostics / doctor / manifest (deferred to full Wave 2 Stream A)
- Tauri plugin commands for sync (deferred to Wave 3) — DB commands only in this slice
- JS Tauri client wrapper (deferred to Wave 3)
- Any changes to Sakti POS app source code

## Decisions

### D1: JSON envelope replaces protobuf as the canonical wire format

**Decision:** The Rust push/pull engine and JS server primitives use JSON as the only encoding in this slice. The JSON envelope shape defines the protocol contract.

**Rationale:** The Sakti code builds per-table protobuf messages through generated `build_*_changes()` functions (10 functions, one per table). This is the deepest coupling point — `build_request_from_chunk` in `push.rs:494-551` hardcodes all 10 tables by name. Switching to JSON lets us build a single generic envelope builder that uses the generated table order as a loop instead of a match statement.

**Envelope shape:**

```json
{
  "scopeId": "outlet-1",
  "clientId": "client-uuid",
  "idempotencyKey": "hash-of-outbox-ids",
  "tables": [
    {
      "table": "categories",
      "changedRows": [ { "id": "cat-1", "name": "Drinks", ... } ],
      "deletedIds": [ "cat-2" ]
    }
  ]
}
```

**Alternative considered:** Keep protobuf for the thin vertical and add JSON later. Rejected because protobuf requires the generated per-table builder layer, which is exactly the coupling we need to remove. JSON eliminates the entire `protobuf_generated.rs` dependency (711 LOC).

### D2: Generic scope replaces merchant_id/outlet_id hardcoding

**Decision:** Replace `outlet_id`, `merchant_id`, and `resolve_merchant_id()` with a single generic `scopeId` string. Scope semantics are defined in the generated contract, not in the engine.

**Rationale:** The Sakti code has hardcoded scope resolution at multiple levels:
- `schema.rs:9-31`: `get_table_filter_column()` returns `"id"`, `"merchant_id"`, or `"outlet_id"` based on table name
- `schema.rs:17-31`: `get_filter_value()` resolves `merchant_id` from `outlet_id` by reading the `outlets` table
- `outbox.rs:8-25`: Queries filter by `scope_type = 'outlet'` or `scope_type = 'merchant'`
- `commands.rs:22`: `resolve_merchant_id()` reads the `outlets` table to get merchant scope

This means the sync engine has Sakti's tenant model baked into its SQL queries. For baresync, the generated contract declares which column is the scope column per table. The engine uses that column name generically.

**Mapping:**

```
Sakti                              Baresync
─────────────────────────────      ──────────────────────────
outlet_id (command param)          scopeId (engine config)
merchant_id (resolved from DB)     scopeId (single scope per engine)
scope_type = 'outlet'|'merchant'   (removed — single scope)
get_table_filter_column()          generated contract scope column
sync_outbox.scope_id = outlet_id   sync_outbox.scope_id = scopeId
```

The outbox table schema changes from `(scope_type, scope_id)` to just `(scope_id)`. This is acceptable because baresync owns its own schema — it's not extracting the Sakti `sync_outbox` table as-is.

### D3: Table order from generated contract, not hardcoded SYNC_TABLES

**Decision:** The engine reads `upsertOrder` and `deleteOrder` from the generated JSON contract. No hardcoded table list.

**Rationale:** `SYNC_TABLES` in `mod.rs:21-32` is a hardcoded array of 10 Sakti table names. The push loop iterates this array to read outbox per table. The pull loop iterates it to request per-table data. For baresync, the generator already computes FK order in `fk-order.ts` — the contract simply includes `upsertOrder` and `deleteOrder` arrays.

### D4: Extraction approach — rewrite the orchestration, preserve the row operations

**Decision:** The generic row-level operations (`upsert_row`, `soft_delete_row`, `build_upsert_query`, `outbox_rows_to_table_changes`, `coalesce_operation`) are extracted nearly verbatim. The orchestration functions (`sync_push_batch_inner`, `build_request_from_chunk`, `sync_pull_batch_inner`) are rewritten to use generic scope + JSON envelope.

**Rationale:** Reading the code confirms that row operations are already generic — they take `table: &str`, `columns: &[String]`, `id: &str`. The coupling is entirely in the orchestration layer that decides *which* tables and *how* to encode. This minimizes risk while achieving the agnostic goal.

### D5: Testing strategy — shared fixtures + dual test harness

**Decision:** Create deterministic JSON fixtures at `packages/baresync/fixtures/sync/` that both Rust (`crates/baresync-core/tests/`) and JS (`packages/baresync/src/server/__test__/`) consume. Add a Rust integration test that runs push+pull against a real temp SQLite DB using fake HTTP responses derived from the same fixtures.

**Rationale:** The PRD calls for cross-language fixtures. Starting with shared JSON ensures protocol parity is checked mechanically, not manually. The fake-HTTP approach (Rust test constructs expected JSON responses from fixtures) proves the engine without needing a running JS server process.

### D6: LOCAL_ONLY_COLUMNS becomes a contract-driven exclusion list

**Decision:** Replace the hardcoded `LOCAL_ONLY_COLUMNS = &["is_synced"]` with a list derived from the generated contract's per-table `localOnlyColumns` metadata.

**Rationale:** The `is_synced` column should not be sent to the server. In Sakti this is a single hardcoded array. In baresync, `defineSyncedTable` lets consumers declare `localOnlyColumns`, which the generator includes in the contract. The engine reads this list at runtime.

## Risks / Trade-offs

**[Risk] Outbox schema divergence from Sakti** → The baresync outbox table uses `(scope_id)` instead of `(scope_type, scope_id)`. This means Sakti cannot use the baresync outbox table directly during migration. Mitigation: The PRD Phase 15 (app migration) handles this explicitly. The thin vertical targets a clean standalone baresync, not backward compatibility.

**[Risk] Row operation extraction misses edge cases** → `upsert_row`, `soft_delete_row`, and `build_upsert_query` contain subtle SQLite behavior (the `is_synced = 1 OR excluded.updated_at >=` guard, `snake_to_camel`/`camel_to_snake` for column name mapping). Mitigation: These functions are extracted nearly verbatim and tested with the same scenarios as Sakti's existing tests.

**[Risk] JSON envelope size vs protobuf** → JSON is larger on the wire. For the thin vertical this is acceptable. Mitigation: The PRD already plans protobuf as an optional encoding. The envelope shape is encoding-agnostic — protobuf later fills the same logical shape.

**[Risk] Re-entry cost for deferred features** → Skipping chunking, idempotency, and reconciliation means we must re-enter `push.rs` and `pull.rs` later. Mitigation: The rewrite cleanly separates "build envelope" from "chunk envelope" from "send envelope". The chunking layer is added *around* the existing push loop, not inside it.

**[Trade-off] No Tauri plugin commands for sync in this slice** → DB commands (run_sql, run_sql_batch, get_db_info, run_migrations) are wrapped as Tauri commands, but sync commands are not. The sync engine is tested through `cargo test` with `SqlitePool` directly. This keeps the thin vertical independent of Tauri runtime.

## Open Questions

- Should the JSON envelope include a `packageName`/version field for future protocol evolution, or is that only needed when protobuf arrives?
- Should the generated contract include column type metadata for future validation, or just column names and order for now?
- Should `sync_outbox` row payloads be stored as camelCase JSON (matching the wire format) or snake_case (matching the SQLite columns)? Sakti stores snake_case and converts at the boundary.
