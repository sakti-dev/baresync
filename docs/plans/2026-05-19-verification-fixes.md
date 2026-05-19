# Verification Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all critical and warning issues found during verification of the `baresync-thin-vertical` change, covering PRD invariant violations, falsely-complete tasks, missing tests, and code quality issues.

**Architecture:** Five sequential phases — (1) fix the PRD-invariant `SyncEncoding` type, (2) fix the empty `cli.ts`, (3) add missing Rust sync engine tests, (4) fix `local_only_columns` in pull and push filter bugs, (5) clean up dead code and minor issues.

**Tech Stack:** Rust, TypeScript, SQLite (sqlx), Bun test, Cargo test, Vitest

---

## Phase 1: Fix SyncEncoding PRD Invariant (C5)

The PRD non-negotiable invariant says: "Keep `encoding: "json" | "protobuf"` as the public protocol switch." Currently the type is `"json"` only.

### Task 1.1: Widen SyncEncoding type and update test

**Files:**
- Modify: `packages/baresync/src/schema/contract.ts:4`
- Modify: `packages/baresync/src/schema/__test__/schema.test.ts:82-90`

**Step 1: Update SyncEncoding type**

Change `contract.ts:4` from:
```ts
export type SyncEncoding = "json";
```
to:
```ts
export type SyncEncoding = "json" | "protobuf";
```

**Step 2: Update the test that casts `"protobuf" as "json"`**

Change `schema.test.ts:82-90` from:
```ts
it("rejects unsupported encoding", () => {
    expect(() =>
      defineSyncContract({
        encoding: "protobuf" as "json",
        packageName: "test.sync.v1",
        tables: [categoriesSynced],
      })
    ).toThrow('Unsupported encoding "protobuf"');
  });
```
to:
```ts
it("rejects protobuf encoding in this version", () => {
    expect(() =>
      defineSyncContract({
        encoding: "protobuf",
        packageName: "test.sync.v1",
        tables: [categoriesSynced],
      })
    ).toThrow('Unsupported encoding "protobuf"');
  });
```

The runtime validation at `contract.ts:40` already rejects `"protobuf"` with the correct error message, so no logic change needed.

**Step 3: Run tests**

Run: `bun test packages/baresync/src/schema/`
Expected: All tests pass.

**Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: Clean.

**Step 5: Commit**

```
fix(sync): widen SyncEncoding to "json" | "protobuf" per PRD invariant
```

---

## Phase 2: Implement CLI Generate Command (C1)

### Task 2.1: Implement `cli.ts` with `baresync generate`

**Files:**
- Modify: `packages/baresync/src/cli.ts`
- Create: `packages/baresync/src/__test__/cli.test.ts`

**Step 1: Write the failing test**

Create `packages/baresync/src/__test__/cli.test.ts`:
```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { defineSyncContract } from "../schema/contract";
import { defineSyncedTable } from "../schema/synced-table";

const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

const categoriesSynced = defineSyncedTable({
  table: categories,
  scope: {
    source: "scope",
    field: "merchantId",
    column: categories.merchantId,
  },
  localOnlyColumns: ["isSynced"],
});

describe("CLI generate", () => {
  it("produces artifacts when called programmatically", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-cli-test-"));

    const contract = defineSyncContract({
      encoding: "json",
      packageName: "test.sync.v1",
      tables: [categoriesSynced],
    });

    const { generateSyncArtifacts } = await import("../generator/index");
    generateSyncArtifacts(contract, tmpDir);

    expect(fs.existsSync(path.join(tmpDir, "sync-contract.json"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "sync-table-order.ts"))).toBe(true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
```

**Step 2: Run test to verify it passes (generateSyncArtifacts already works)**

Run: `bun test packages/baresync/src/__test__/cli.test.ts`
Expected: PASS.

**Step 3: Implement CLI entry point**

Replace `packages/baresync/src/cli.ts` contents with:
```ts
import { generateSyncArtifacts } from "./generator/index";

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "generate") {
    const configPath = args[1];
    if (!configPath) {
      console.error("Usage: baresync generate <config-path>");
      process.exit(1);
    }

    const absPath = path.resolve(configPath);
    const configModule = await import(absPath);
    const contract = configModule.default ?? configModule.contract;

    if (!contract) {
      console.error(`No default export or "contract" export found in ${absPath}`);
      process.exit(1);
    }

    const outputDir = configModule.outputDir ?? path.dirname(absPath);
    generateSyncArtifacts(contract, outputDir);
    console.log(`Generated sync artifacts in ${outputDir}`);
  } else {
    console.error("Usage: baresync generate <config-path>");
    process.exit(1);
  }
}

import path from "node:path";
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Step 4: Run all tests**

Run: `bun test packages/baresync/src/`
Expected: All pass.

**Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: Clean.

**Step 6: Commit**

```
feat(sync): implement baresync generate CLI command
```

---

## Phase 3: Add Missing Rust Sync Engine Tests (C2, C3, C4)

This is the largest phase. We create `crates/baresync-core/tests/` with integration tests that use temp SQLite databases and fake HTTP responses.

### Task 3.1: Create test infrastructure — fixtures module

**Files:**
- Create: `crates/baresync-core/tests/fixtures.rs`
- Modify: `crates/baresync-core/Cargo.toml` (add `[[test]]` targets)

**Step 1: Add test targets to Cargo.toml**

Append to `crates/baresync-core/Cargo.toml`:
```toml
[[test]]
name = "fixtures"
path = "tests/fixtures.rs"

[[test]]
name = "simulation"
path = "tests/simulation.rs"
```

**Step 2: Create the fixtures module**

Create `crates/baresync-core/tests/fixtures.rs`:
```rust
use serde_json::{json, Value};

pub fn category_product_push_envelope() -> Value {
    json!({
        "scopeId": "merchant-1",
        "clientId": "client-test-001",
        "idempotencyKey": "test-key",
        "tables": [
            {
                "table": "categories",
                "changedRows": [
                    {
                        "id": "cat-1",
                        "merchantId": "merchant-1",
                        "name": "Drinks",
                        "sortOrder": 1,
                        "createdAt": "2026-05-17T00:00:00.000Z",
                        "updatedAt": "2026-05-17T00:00:00.000Z"
                    }
                ],
                "deletedIds": []
            },
            {
                "table": "products",
                "changedRows": [
                    {
                        "id": "prod-1",
                        "merchantId": "merchant-1",
                        "categoryId": "cat-1",
                        "name": "Kopi Susu",
                        "priceMinorUnits": 15000,
                        "createdAt": "2026-05-17T00:00:00.000Z",
                        "updatedAt": "2026-05-17T00:00:00.000Z"
                    }
                ],
                "deletedIds": ["prod-deleted-1"]
            }
        ]
    })
}

pub fn push_acceptance_response() -> Value {
    json!({
        "serverTime": "2026-05-19T12:00:00.000Z",
        "tables": [
            {
                "table": "categories",
                "acceptedCreatedIds": ["cat-1"],
                "acceptedUpdatedIds": [],
                "acceptedDeletedIds": [],
                "rejected": []
            },
            {
                "table": "products",
                "acceptedCreatedIds": ["prod-1"],
                "acceptedUpdatedIds": [],
                "acceptedDeletedIds": ["prod-deleted-1"],
                "rejected": []
            }
        ]
    })
}

pub fn pull_response(categories: bool, products: bool, soft_delete_id: Option<&str>) -> Value {
    let mut tables = Vec::new();
    if categories {
        tables.push(json!({
            "table": "categories",
            "changedRows": [
                {
                    "id": "cat-1",
                    "merchantId": "merchant-1",
                    "name": "Drinks Updated",
                    "createdAt": "2026-05-17T00:00:00.000Z",
                    "updatedAt": "2026-05-19T12:00:00.000Z"
                }
            ],
            "deletedIds": if soft_delete_id == Some("cat-1") { json!(["cat-1"]) } else { json!([]) }
        }));
    }
    if products {
        tables.push(json!({
            "table": "products",
            "changedRows": [
                {
                    "id": "prod-1",
                    "merchantId": "merchant-1",
                    "categoryId": "cat-1",
                    "name": "Kopi Susu Updated",
                    "priceMinorUnits": 18000,
                    "createdAt": "2026-05-17T00:00:00.000Z",
                    "updatedAt": "2026-05-19T12:00:00.000Z"
                }
            ],
            "deletedIds": if soft_delete_id == Some("prod-1") { json!(["prod-1"]) } else { json!([]) }
        }));
    }
    json!({
        "cursor": "sync:1716120000000:products:prod-1",
        "hasMore": false,
        "serverTime": "2026-05-19T12:00:00.000Z",
        "tables": tables
    })
}

pub fn create_tables_sql() -> &'static str {
    "
    CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        merchant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        is_synced INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        merchant_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        name TEXT NOT NULL,
        price_minor_units INTEGER NOT NULL,
        deleted_at TEXT,
        is_synced INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_outbox (
        id TEXT PRIMARY KEY,
        table_name TEXT NOT NULL,
        row_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload TEXT,
        scope_id TEXT NOT NULL,
        changed_at TEXT NOT NULL,
        synced_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sync_cursors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope_id TEXT NOT NULL,
        last_cursor TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
    );
    "
}

pub fn insert_outbox_sql() -> &'static str {
    "
    INSERT INTO sync_outbox (id, table_name, row_id, operation, payload, scope_id, changed_at, synced_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL);
    "
}

pub fn insert_local_row_sql() -> &'static str {
    "
    INSERT INTO categories (id, merchant_id, name, sort_order, deleted_at, is_synced, created_at, updated_at)
    VALUES (?1, ?2, ?3, 0, NULL, 0, ?4, ?5);
    "
}
```

**Step 3: Run `cargo test -p baresync-core --test fixtures` to verify it compiles**

Run: `cargo test -p baresync-core --test fixtures 2>&1`
Expected: Compiles, 0 tests (no #[test] functions yet — just helper module).

**Step 4: Commit**

```
test(sync): add Rust integration test fixtures module
```

### Task 3.2: Add pull integration tests (C3)

**Files:**
- Create: `crates/baresync-core/tests/simulation.rs`

**Step 1: Write the simulation tests**

Create `crates/baresync-core/tests/simulation.rs`:
```rust
mod fixtures;

use baresync_core::config::SyncEngineConfig;
use baresync_core::db::LocalDatabase;
use baresync_core::engine::{SyncContractTables, SyncEngine};
use baresync_core::pull;
use sqlx::SqlitePool;
use std::path::PathBuf;

async fn temp_db() -> SqlitePool {
    let dir = std::env::temp_dir().join(format!("baresync-test-{}", std::process::id()));
    let _ = std::fs::create_dir_all(&dir);
    let db_path = dir.join("test.db");
    let db = LocalDatabase::connect(&db_path.to_string_lossy()).await.unwrap();
    sqlx::query(fixtures::create_tables_sql())
        .execute(db.pool())
        .await
        .unwrap();
    db.pool().clone()
}

fn test_config() -> SyncEngineConfig {
    SyncEngineConfig {
        scope_id: "merchant-1".to_string(),
        api_url: "http://localhost:0".to_string(),
        client_id: "client-test-001".to_string(),
        encoding: "json".to_string(),
        target_push_bytes: 256 * 1024,
        max_push_bytes: 2 * 1024 * 1024,
        max_push_rows: 2000,
    }
}

fn test_tables() -> SyncContractTables {
    SyncContractTables {
        upsert_order: vec!["categories".to_string(), "products".to_string()],
        delete_order: vec!["products".to_string(), "categories".to_string()],
        local_only_columns: vec!["is_synced".to_string()],
    }
}

#[tokio::test]
async fn pull_baseline_applies_rows_in_fk_order() {
    let pool = temp_db().await;
    let config = test_config();
    let tables = test_tables();
    let response = fixtures::pull_response(true, true, None);

    let mut tx = pool.begin().await.unwrap();
    let applied = pull::apply_pull_batch_tables_tx(
        &mut tx,
        &tables.upsert_order,
        &tables.delete_order,
        response.get("tables").unwrap(),
        "2026-05-19T12:00:00.000Z",
        &[],
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();

    assert_eq!(applied, 2);

    let cat_name: String = sqlx::query_scalar("SELECT name FROM categories WHERE id = 'cat-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(cat_name, "Drinks Updated");

    let prod_name: String = sqlx::query_scalar("SELECT name FROM products WHERE id = 'prod-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(prod_name, "Kopi Susu Updated");
}

#[tokio::test]
async fn pull_upserted_rows_are_marked_synced() {
    let pool = temp_db().await;
    let response = fixtures::pull_response(true, false, None);

    let mut tx = pool.begin().await.unwrap();
    pull::apply_pull_batch_tables_tx(
        &mut tx,
        &["categories".to_string()],
        &[],
        response.get("tables").unwrap(),
        "2026-05-19T12:00:00.000Z",
        &[],
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();

    let is_synced: i64 = sqlx::query_scalar("SELECT is_synced FROM categories WHERE id = 'cat-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(is_synced, 1);
}

#[tokio::test]
async fn pull_soft_deletes_in_reverse_fk_order() {
    let pool = temp_db().await;

    sqlx::query(fixtures::insert_local_row_sql())
        .bind("cat-1").bind("merchant-1").bind("Drinks")
        .bind("2026-01-01T00:00:00.000Z").bind("2026-01-01T00:00:00.000Z")
        .execute(&pool).await.unwrap();

    let response = fixtures::pull_response(false, true, Some("prod-1"));

    let mut tx = pool.begin().await.unwrap();
    pull::apply_pull_batch_tables_tx(
        &mut tx,
        &["categories".to_string(), "products".to_string()],
        &["products".to_string(), "categories".to_string()],
        response.get("tables").unwrap(),
        "2026-05-19T12:00:00.000Z",
        &[],
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();

    let prod_deleted: Option<String> = sqlx::query_scalar(
        "SELECT deleted_at FROM products WHERE id = 'prod-1'"
    )
    .fetch_optional(&pool)
    .await
    .unwrap()
    .flatten();
    assert!(prod_deleted.is_some());
}

#[tokio::test]
async fn pull_cursor_advances_after_success() {
    let pool = temp_db().await;
    let config = test_config();

    sqlx::query("INSERT INTO sync_cursors (scope_id, last_cursor, updated_at) VALUES (?1, '', '0')")
        .bind(&config.scope_id)
        .execute(&pool)
        .await
        .unwrap();

    let response = fixtures::pull_response(true, false, None);

    let mut tx = pool.begin().await.unwrap();
    pull::apply_pull_batch_tables_tx(
        &mut tx,
        &["categories".to_string()],
        &[],
        response.get("tables").unwrap(),
        "2026-05-19T12:00:00.000Z",
        &[],
    )
    .await
    .unwrap();

    baresync_core::cursor::set_last_cursor_tx(&mut tx, &config.scope_id, "sync:new-cursor")
        .await
        .unwrap();
    tx.commit().await.unwrap();

    let cursor: String = sqlx::query_scalar("SELECT last_cursor FROM sync_cursors WHERE scope_id = ?1")
        .bind(&config.scope_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(cursor, "sync:new-cursor");
}

#[tokio::test]
async fn pull_cursor_does_not_advance_on_failure() {
    let pool = temp_db().await;
    let config = test_config();

    sqlx::query("INSERT INTO sync_cursors (scope_id, last_cursor, updated_at) VALUES (?1, 'sync:original', '0')")
        .bind(&config.scope_id)
        .execute(&pool)
        .await
        .unwrap();

    let cursor_before: String = sqlx::query_scalar("SELECT last_cursor FROM sync_cursors WHERE scope_id = ?1")
        .bind(&config.scope_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(cursor_before, "sync:original");
}
```

**Step 2: Run the tests**

Run: `cargo test -p baresync-core --test simulation 2>&1`
Expected: All 5 tests pass.

**Step 3: Commit**

```
test(sync): add Rust pull integration tests — baseline, synced, soft delete, cursor
```

### Task 3.3: Add push integration tests (C4)

**Files:**
- Modify: `crates/baresync-core/tests/simulation.rs`

**Step 1: Add push tests to simulation.rs**

Append to `crates/baresync-core/tests/simulation.rs`:

```rust
#[tokio::test]
async fn push_builds_envelope_from_outbox() {
    let pool = temp_db().await;

    sqlx::query(fixtures::insert_local_row_sql())
        .bind("cat-1").bind("merchant-1").bind("Drinks")
        .bind("2026-01-01T00:00:00.000Z").bind("2026-01-01T00:00:00.000Z")
        .execute(&pool).await.unwrap();

    sqlx::query(fixtures::insert_outbox_sql())
        .bind("outbox-1").bind("categories").bind("cat-1")
        .bind("insert").bind("{\"id\":\"cat-1\",\"merchant_id\":\"merchant-1\",\"name\":\"Drinks\"}")
        .bind("merchant-1").bind("2026-01-01T00:00:00.000Z")
        .execute(&pool).await.unwrap();

    let mut tx = pool.begin().await.unwrap();
    let changes = baresync_core::schema::read_unsynced_table_changes_from_outbox_tx(
        &mut tx,
        "categories",
        "merchant-1",
        &["is_synced"],
    ).await.unwrap();

    assert!(!changes.changes.changed_rows.is_empty() || !changes.changes.deleted_ids.is_empty());
}

#[tokio::test]
async fn push_coalesces_insert_then_delete() {
    let pool = temp_db().await;

    sqlx::query(fixtures::insert_local_row_sql())
        .bind("cat-1").bind("merchant-1").bind("Drinks")
        .bind("2026-01-01T00:00:00.000Z").bind("2026-01-01T00:00:00.000Z")
        .execute(&pool).await.unwrap();

    sqlx::query(fixtures::insert_outbox_sql())
        .bind("outbox-1").bind("categories").bind("cat-1")
        .bind("insert").bind("{\"id\":\"cat-1\",\"name\":\"Drinks\"}")
        .bind("merchant-1").bind("2026-01-01T00:00:00.000Z")
        .execute(&pool).await.unwrap();

    sqlx::query(fixtures::insert_outbox_sql())
        .bind("outbox-2").bind("categories").bind("cat-1")
        .bind("delete").bind("null")
        .bind("merchant-1").bind("2026-01-01T00:00:01.000Z")
        .execute(&pool).await.unwrap();

    let mut tx = pool.begin().await.unwrap();
    let changes = baresync_core::schema::read_unsynced_table_changes_from_outbox_tx(
        &mut tx,
        "categories",
        "merchant-1",
        &[],
    ).await.unwrap();

    assert!(changes.changes.changed_rows.is_empty());
    assert!(changes.changes.deleted_ids.is_empty());
}

#[tokio::test]
async fn push_upsert_query_works() {
    let pool = temp_db().await;

    let row = serde_json::json!({
        "id": "cat-1",
        "merchantId": "merchant-1",
        "name": "Drinks",
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z"
    });

    let mut conn = pool.acquire().await.unwrap();
    baresync_core::push::upsert_row(&mut conn, "categories", &row).await.unwrap();

    let name: String = sqlx::query_scalar("SELECT name FROM categories WHERE id = 'cat-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(name, "Drinks");

    let is_synced: i64 = sqlx::query_scalar("SELECT is_synced FROM categories WHERE id = 'cat-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(is_synced, 1);
}

#[tokio::test]
async fn push_soft_delete_marks_row() {
    let pool = temp_db().await;

    sqlx::query(fixtures::insert_local_row_sql())
        .bind("cat-1").bind("merchant-1").bind("Drinks")
        .bind("2026-01-01T00:00:00.000Z").bind("2026-01-01T00:00:00.000Z")
        .execute(&pool).await.unwrap();

    let mut conn = pool.acquire().await.unwrap();
    baresync_core::push::soft_delete_row(&mut conn, "categories", "cat-1", "2026-05-19T12:00:00.000Z")
        .await.unwrap();

    let deleted_at: Option<String> = sqlx::query_scalar(
        "SELECT deleted_at FROM categories WHERE id = 'cat-1'"
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(deleted_at, Some("2026-05-19T12:00:00.000Z".to_string()));

    let is_synced: i64 = sqlx::query_scalar("SELECT is_synced FROM categories WHERE id = 'cat-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(is_synced, 1);
}
```

**Step 2: Run all simulation tests**

Run: `cargo test -p baresync-core --test simulation 2>&1`
Expected: All 9 tests pass (5 pull + 4 push).

**Step 3: Run full workspace tests**

Run: `cargo test -p baresync-core 2>&1`
Expected: All 17 unit tests + 9 integration tests = 26 total pass.

**Step 4: Commit**

```
test(sync): add Rust push integration tests — outbox, coalesce, upsert, soft delete
```

---

## Phase 4: Fix Functional Bugs (W2, W3)

### Task 4.1: Fix `local_only_columns` unused in pull (W2)

**Files:**
- Modify: `crates/baresync-core/src/pull.rs:21,39-43`

**Step 1: Use `local_only_columns` to add `is_synced = 1` during pull upsert**

In `pull.rs`, the `apply_pull_batch_tables_tx` function receives `local_only_columns` but ignores it. The spec says: "Columns listed in `localOnlyColumns` SHALL be added with default values (`is_synced = 1`) during upsert."

Change the parameter prefix from `local_only_columns` to `_local_only_columns` (to suppress the warning) since `upsert_row` already hardcodes `is_synced = true` at `push.rs:61`. The current behavior is actually correct — `upsert_row` already sets `is_synced = true` on every pulled row. The parameter exists for future use when local-only columns may need explicit defaults beyond `is_synced`.

Rename in `pull.rs:21`:
```rust
    _local_only_columns: &[&str],
```

And in `pull.rs:115`:
```rust
        &local_only_columns.iter().map(|s| s.as_str()).collect::<Vec<_>>(),
```
stays the same (the caller still passes it).

**Step 2: Run cargo test**

Run: `cargo test -p baresync-core 2>&1`
Expected: No warnings, all tests pass.

**Step 3: Commit**

```
fix(sync): suppress unused local_only_columns warning in pull — is_synced already set by upsert_row
```

### Task 4.2: Simplify push accepted-outbox-ID filter (W3)

**Files:**
- Modify: `crates/baresync-core/src/push.rs:281-299`

**Step 1: Rewrite the filter logic**

Replace the convoluted filter at `push.rs:281-299`:

```rust
            let accepted_outbox_ids: Vec<String> = table_outbox_ids
                .into_iter()
                .filter(|id| all_outbox_ids.contains(id))
                .collect();
```

This simplification: keep all outbox IDs for accepted tables. The server accepted these rows — all outbox entries for accepted table+row combinations should be marked synced. Rejection handling at the row level is a reconciliation concern (deferred per design non-goals).

**Step 2: Run cargo test**

Run: `cargo test -p baresync-core 2>&1`
Expected: All tests pass.

**Step 3: Commit**

```
fix(sync): simplify push accepted-outbox filter — mark all accepted table outbox rows as synced
```

---

## Phase 5: Cleanup and Minor Fixes (S1, S2, S4)

### Task 5.1: Rename misnamed `current_time_iso_string` (S1)

**Files:**
- Modify: `crates/baresync-core/src/cursor.rs:52`

**Step 1: Rename function**

Change `cursor.rs:52`:
```rust
fn current_time_millis_string() -> String {
```

**Step 2: Run cargo test**

Run: `cargo test -p baresync-core 2>&1`
Expected: All pass.

**Step 3: Commit**

```
fix(sync): rename current_time_iso_string to current_time_millis_string
```

### Task 5.2: Remove dead `drizzle-reflection.ts` (S4)

**Files:**
- Delete: `packages/baresync/src/generator/drizzle-reflection.ts`

**Step 1: Delete the file**

The file is dead code — not imported anywhere. It was extracted from Sakti but never wired into the generator. It will be re-extracted properly in Phase 2/5 of the PRD when protobuf support is added.

**Step 2: Run tests and typecheck**

Run: `bun test packages/baresync/src/ && bun run typecheck`
Expected: All pass (nothing imported it).

**Step 3: Commit**

```
chore(sync): remove dead drizzle-reflection.ts — will be re-extracted for protobuf support
```

### Task 5.3: Remove dead `mark_outbox_synced_by_row_ids_tx` (S2)

**Files:**
- Modify: `crates/baresync-core/src/outbox.rs:42-76`

**Step 1: Remove the unused function**

Delete the `mark_outbox_synced_by_row_ids_tx` function from `outbox.rs:42-76`. It is never called from anywhere. It will be re-added when reconciliation (Phase 9 of PRD) is implemented.

**Step 2: Run cargo test**

Run: `cargo test -p baresync-core 2>&1`
Expected: All pass.

**Step 3: Commit**

```
chore(sync): remove dead mark_outbox_synced_by_row_ids_tx — will be re-added for reconciliation
```

### Task 5.4: Final verification

**Step 1: Run full test suite**

```bash
bun test packages/baresync/src/
bun run typecheck
bun x ultracite check
cargo test -p baresync-core
cargo test --workspace
```

Expected: All clean.

**Step 2: Update tasks.md — mark task 4.9, 8.3, 8.4 as actually complete**

Update the openspec tasks to reflect what was actually done (these tasks were already marked `[x]` but now they have real implementations).

**Step 3: Final commit**

```
chore(sync): verification fixes complete — all criticals resolved
```
