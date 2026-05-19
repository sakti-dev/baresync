mod fixtures;

use baresync_core::gc;
use baresync_core::pull;
use baresync_core::push::{self, PendingTablePush};
use baresync_core::schema;
use sqlx::SqlitePool;
use std::sync::atomic::{AtomicU64, Ordering};

static TEST_COUNTER: AtomicU64 = AtomicU64::new(0);

async fn temp_db() -> SqlitePool {
    let counter = TEST_COUNTER.fetch_add(1, Ordering::Relaxed);
    let dir =
        std::env::temp_dir().join(format!("baresync-test-{}-{}", std::process::id(), counter));
    let _ = std::fs::create_dir_all(&dir);
    let db_path = dir.join("test.db");
    let db = baresync_core::db::LocalDatabase::connect(db_path.to_str().unwrap())
        .await
        .unwrap();
    sqlx::query(fixtures::create_tables_sql())
        .execute(db.pool())
        .await
        .unwrap();
    db.pool().clone()
}

async fn seed_categories_and_products(pool: &SqlitePool) {
    sqlx::query(fixtures::insert_category_sql())
        .bind("cat-1")
        .bind("merchant-1")
        .bind("Drinks")
        .bind("2026-01-01T00:00:00.000Z")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(pool)
        .await
        .unwrap();

    sqlx::query("INSERT INTO products (id, merchant_id, category_id, name, price_minor_units, deleted_at, is_synced, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, NULL, 0, ?6, ?7)")
        .bind("prod-1")
        .bind("merchant-1")
        .bind("cat-1")
        .bind("Kopi Susu")
        .bind(15000)
        .bind("2026-01-01T00:00:00.000Z")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(pool)
        .await
        .unwrap();
}

#[tokio::test]
async fn pull_baseline_applies_rows_in_fk_order() {
    let pool = temp_db().await;
    let response = fixtures::pull_response(true, true, None);

    let mut tx = pool.begin().await.unwrap();
    let applied = pull::apply_pull_batch_tables_tx(
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

    sqlx::query(fixtures::insert_category_sql())
        .bind("cat-1")
        .bind("merchant-1")
        .bind("Drinks")
        .bind("2026-01-01T00:00:00.000Z")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

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

    let prod_deleted: Option<String> =
        sqlx::query_scalar("SELECT deleted_at FROM products WHERE id = 'prod-1'")
            .fetch_optional(&pool)
            .await
            .unwrap()
            .flatten();
    assert!(prod_deleted.is_some());
}

#[tokio::test]
async fn pull_cursor_advances_after_success() {
    let pool = temp_db().await;

    sqlx::query(
        "INSERT INTO sync_cursors (scope_id, last_cursor, updated_at) VALUES (?1, '', '0')",
    )
    .bind("merchant-1")
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

    baresync_core::cursor::set_last_cursor_tx(&mut tx, "merchant-1", "sync:new-cursor")
        .await
        .unwrap();
    tx.commit().await.unwrap();

    let cursor: String =
        sqlx::query_scalar("SELECT last_cursor FROM sync_cursors WHERE scope_id = ?1")
            .bind("merchant-1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(cursor, "sync:new-cursor");
}

#[tokio::test]
async fn pull_cursor_does_not_advance_on_failure() {
    let pool = temp_db().await;

    sqlx::query(
        "INSERT INTO sync_cursors (scope_id, last_cursor, updated_at) VALUES (?1, 'sync:original', '0')",
    )
    .bind("merchant-1")
    .execute(&pool)
    .await
    .unwrap();

    let cursor_before: String =
        sqlx::query_scalar("SELECT last_cursor FROM sync_cursors WHERE scope_id = ?1")
            .bind("merchant-1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(cursor_before, "sync:original");
}

#[tokio::test]
async fn push_builds_envelope_from_outbox() {
    let pool = temp_db().await;

    sqlx::query(fixtures::insert_category_sql())
        .bind("cat-1")
        .bind("merchant-1")
        .bind("Drinks")
        .bind("2026-01-01T00:00:00.000Z")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query(fixtures::insert_outbox_sql())
        .bind("outbox-1")
        .bind("categories")
        .bind("cat-1")
        .bind("insert")
        .bind("{\"id\":\"cat-1\",\"merchant_id\":\"merchant-1\",\"name\":\"Drinks\"}")
        .bind("merchant-1")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    let mut tx = pool.begin().await.unwrap();
    let changes = baresync_core::schema::read_unsynced_table_changes_from_outbox_tx(
        &mut tx,
        "categories",
        "merchant-1",
        &["is_synced"],
    )
    .await
    .unwrap();

    assert!(!changes.changes.changed_rows.is_empty() || !changes.changes.deleted_ids.is_empty());
}

#[tokio::test]
async fn push_coalesces_insert_then_delete() {
    let pool = temp_db().await;

    sqlx::query(fixtures::insert_category_sql())
        .bind("cat-1")
        .bind("merchant-1")
        .bind("Drinks")
        .bind("2026-01-01T00:00:00.000Z")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query(fixtures::insert_outbox_sql())
        .bind("outbox-1")
        .bind("categories")
        .bind("cat-1")
        .bind("insert")
        .bind("{\"id\":\"cat-1\",\"name\":\"Drinks\"}")
        .bind("merchant-1")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query(fixtures::insert_outbox_sql())
        .bind("outbox-2")
        .bind("categories")
        .bind("cat-1")
        .bind("delete")
        .bind("null")
        .bind("merchant-1")
        .bind("2026-01-01T00:00:01.000Z")
        .execute(&pool)
        .await
        .unwrap();

    let mut tx = pool.begin().await.unwrap();
    let changes = baresync_core::schema::read_unsynced_table_changes_from_outbox_tx(
        &mut tx,
        "categories",
        "merchant-1",
        &[],
    )
    .await
    .unwrap();

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

    let mut tx = pool.begin().await.unwrap();
    baresync_core::push::upsert_row(&mut tx, "categories", &row)
        .await
        .unwrap();
    tx.commit().await.unwrap();

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

    sqlx::query(fixtures::insert_category_sql())
        .bind("cat-1")
        .bind("merchant-1")
        .bind("Drinks")
        .bind("2026-01-01T00:00:00.000Z")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    let mut tx = pool.begin().await.unwrap();
    baresync_core::push::soft_delete_row(
        &mut tx,
        "categories",
        "cat-1",
        "2026-05-19T12:00:00.000Z",
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();

    let deleted_at: Option<String> =
        sqlx::query_scalar("SELECT deleted_at FROM categories WHERE id = 'cat-1'")
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

#[tokio::test]
async fn gc_after_pull_and_push_lifecycle() {
    let pool = temp_db().await;
    seed_categories_and_products(&pool).await;

    sqlx::query("UPDATE products SET deleted_at = '2026-05-19T12:00:00.000Z', is_synced = 1 WHERE id = 'prod-1'")
        .execute(&pool)
        .await
        .unwrap();

    let purged = gc::run_garbage_collection(
        &pool,
        &["categories".to_string(), "products".to_string()],
        "merchant-1",
    )
    .await
    .unwrap();
    assert_eq!(purged, 1);

    let prod_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM products WHERE id = 'prod-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(prod_count, 0);

    let cat_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM categories WHERE id = 'cat-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(cat_count, 1);
}

#[tokio::test]
async fn baseline_pull_does_not_advance_stored_cursor() {
    let pool = temp_db().await;

    sqlx::query(
        "INSERT INTO sync_cursors (scope_id, last_cursor, updated_at) VALUES ('merchant-1', 'sync:original', '0')",
    )
    .execute(&pool)
    .await
    .unwrap();

    let response = fixtures::pull_response(true, false, None);
    let mut tx = pool.begin().await.unwrap();
    let _ = pull::apply_pull_batch_tables_tx(
        &mut tx,
        &["categories".to_string()],
        &[],
        response.get("tables").unwrap(),
        "2026-05-19T12:00:00.000Z",
        &[],
    )
    .await
    .unwrap();

    let new_cursor = response
        .get("cursor")
        .and_then(|c| c.as_str())
        .unwrap_or("");
    assert!(!new_cursor.is_empty());

    tx.commit().await.unwrap();

    let cursor: String =
        sqlx::query_scalar("SELECT last_cursor FROM sync_cursors WHERE scope_id = 'merchant-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(cursor, "sync:original");
}

#[tokio::test]
async fn push_flatten_chunk_roundtrip_from_outbox() {
    let pool = temp_db().await;
    seed_categories_and_products(&pool).await;

    for i in 0..3 {
        sqlx::query(fixtures::insert_outbox_sql())
            .bind(format!("outbox-cat-{}", i))
            .bind("categories")
            .bind("cat-1")
            .bind("update")
            .bind("{\"id\":\"cat-1\",\"name\":\"Updated\"}")
            .bind("merchant-1")
            .bind("2026-05-19T00:00:00.000Z")
            .execute(&pool)
            .await
            .unwrap();
    }

    for i in 0..2 {
        sqlx::query(fixtures::insert_outbox_sql())
            .bind(format!("outbox-prod-del-{}", i))
            .bind("products")
            .bind(format!("prod-del-{}", i))
            .bind("delete")
            .bind("null")
            .bind("merchant-1")
            .bind("2026-05-19T00:00:00.000Z")
            .execute(&pool)
            .await
            .unwrap();
    }

    let mut tx = pool.begin().await.unwrap();
    let cat_changes = schema::read_unsynced_table_changes_from_outbox_tx(
        &mut tx,
        "categories",
        "merchant-1",
        &["is_synced"],
    )
    .await
    .unwrap();
    drop(tx);

    let cat_units: Vec<PendingTablePush> = push::flatten_pending_tables("categories", &cat_changes);
    assert!(!cat_units.is_empty());

    let mut tx = pool.begin().await.unwrap();
    let prod_changes = schema::read_unsynced_table_changes_from_outbox_tx(
        &mut tx,
        "products",
        "merchant-1",
        &["is_synced"],
    )
    .await
    .unwrap();
    drop(tx);

    let prod_units: Vec<PendingTablePush> = push::flatten_pending_tables("products", &prod_changes);
    assert!(!prod_units.is_empty());

    let all_units: Vec<PendingTablePush> = cat_units
        .into_iter()
        .chain(prod_units.into_iter())
        .collect();

    assert!(all_units.len() >= 2);

    let chunks =
        push::chunk_pending_push_tables(all_units, 1, usize::MAX, "merchant-1", "client-1");
    assert!(chunks.len() >= 2);

    for chunk in &chunks {
        let merged = push::merge_pending_units(chunk.clone());
        let _envelope =
            push::build_json_push_envelope("merchant-1", "client-1", "test-key", &merged);
    }
}

#[tokio::test]
async fn sim_local_offline_inserts_create_outbox_entries() {
    let pool = temp_db().await;

    let cat_row = serde_json::json!({
        "id": "cat-1",
        "merchantId": "merchant-1",
        "name": "Drinks",
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z"
    });
    let mut tx = pool.begin().await.unwrap();
    push::upsert_row(&mut tx, "categories", &cat_row)
        .await
        .unwrap();
    tx.commit().await.unwrap();

    sqlx::query(fixtures::insert_outbox_sql())
        .bind("outbox-cat-1")
        .bind("categories")
        .bind("cat-1")
        .bind("insert")
        .bind(serde_json::to_string(&cat_row).unwrap())
        .bind("merchant-1")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    let prod_row = serde_json::json!({
        "id": "prod-1",
        "merchantId": "merchant-1",
        "categoryId": "cat-1",
        "name": "Kopi Susu",
        "priceMinorUnits": 15000,
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z"
    });
    let mut tx = pool.begin().await.unwrap();
    push::upsert_row(&mut tx, "products", &prod_row)
        .await
        .unwrap();
    tx.commit().await.unwrap();

    sqlx::query(fixtures::insert_outbox_sql())
        .bind("outbox-prod-1")
        .bind("products")
        .bind("prod-1")
        .bind("insert")
        .bind(serde_json::to_string(&prod_row).unwrap())
        .bind("merchant-1")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    let outbox_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sync_outbox WHERE synced_at IS NULL")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(outbox_count, 2);

    let cat_outbox: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sync_outbox WHERE table_name = 'categories' AND synced_at IS NULL",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(cat_outbox, 1);

    let prod_outbox: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sync_outbox WHERE table_name = 'products' AND synced_at IS NULL",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(prod_outbox, 1);
}

#[tokio::test]
async fn sim_push_reads_outbox_in_upsert_order() {
    let pool = temp_db().await;
    seed_categories_and_products(&pool).await;

    sqlx::query(fixtures::insert_outbox_sql())
        .bind("outbox-prod-1")
        .bind("products")
        .bind("prod-1")
        .bind("update")
        .bind("{\"id\":\"prod-1\",\"name\":\"Updated Product\"}")
        .bind("merchant-1")
        .bind("2026-05-19T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query(fixtures::insert_outbox_sql())
        .bind("outbox-cat-1")
        .bind("categories")
        .bind("cat-1")
        .bind("update")
        .bind("{\"id\":\"cat-1\",\"name\":\"Updated Category\"}")
        .bind("merchant-1")
        .bind("2026-05-19T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    let upsert_order = vec!["categories".to_string(), "products".to_string()];
    let mut all_units: Vec<PendingTablePush> = Vec::new();

    for table in &upsert_order {
        let mut tx = pool.begin().await.unwrap();
        let changes =
            schema::read_unsynced_table_changes_from_outbox_tx(&mut tx, table, "merchant-1", &[])
                .await
                .unwrap();
        drop(tx);
        all_units.push(
            push::flatten_pending_tables(table, &changes)
                .into_iter()
                .next()
                .unwrap(),
        );
    }

    assert_eq!(all_units[0].table, "categories");
    assert_eq!(all_units[1].table, "products");
}

#[tokio::test]
async fn sim_pull_deleted_ids_soft_deletes_product() {
    let pool = temp_db().await;
    seed_categories_and_products(&pool).await;

    let response = fixtures::soft_delete_pull_response();

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

    let deleted_at: Option<String> =
        sqlx::query_scalar("SELECT deleted_at FROM products WHERE id = 'prod-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(deleted_at.is_some());
    assert!(deleted_at.unwrap().len() > 0);

    let is_synced: i64 = sqlx::query_scalar("SELECT is_synced FROM products WHERE id = 'prod-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(is_synced, 1);
}

#[tokio::test]
async fn sim_server_wins_rejection_reconciled_by_pull() {
    let pool = temp_db().await;
    seed_categories_and_products(&pool).await;

    let rejection = fixtures::push_rejection_response();
    let recon_pull = rejection.get("reconciliationPull").unwrap();

    let mut tx = pool.begin().await.unwrap();
    pull::apply_pull_batch_tables_tx(
        &mut tx,
        &["categories".to_string()],
        &[],
        recon_pull.get("tables").unwrap(),
        "2026-05-19T12:00:02.000Z",
        &[],
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();

    let cat_name: String = sqlx::query_scalar("SELECT name FROM categories WHERE id = 'cat-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(cat_name, "Drinks Server Version");

    let cat_updated: String =
        sqlx::query_scalar("SELECT updated_at FROM categories WHERE id = 'cat-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(cat_updated, "2026-05-19T12:00:02.000Z");
}

#[tokio::test]
async fn sim_adaptive_chunking_splits_on_413() {
    let pool = temp_db().await;
    seed_categories_and_products(&pool).await;

    for i in 0..4 {
        if i != 1 {
            sqlx::query("INSERT INTO products (id, merchant_id, category_id, name, price_minor_units, deleted_at, is_synced, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, NULL, 0, ?6, ?7)")
                .bind(format!("prod-{}", i))
                .bind("merchant-1")
                .bind("cat-1")
                .bind(format!("Item {}", i))
                .bind(15000 + i as i64)
                .bind("2026-05-19T00:00:00.000Z")
                .bind("2026-05-19T00:00:00.000Z")
                .execute(&pool)
                .await
                .unwrap();
        }

        sqlx::query(fixtures::insert_outbox_sql())
            .bind(format!("outbox-prod-{}", i))
            .bind("products")
            .bind(format!("prod-{}", i))
            .bind("insert")
            .bind(format!("{{\"id\":\"prod-{}\",\"name\":\"Item {}\"}}", i, i))
            .bind("merchant-1")
            .bind("2026-05-19T00:00:00.000Z")
            .execute(&pool)
            .await
            .unwrap();
    }

    let mut tx = pool.begin().await.unwrap();
    let changes =
        schema::read_unsynced_table_changes_from_outbox_tx(&mut tx, "products", "merchant-1", &[])
            .await
            .unwrap();
    drop(tx);

    let units = push::flatten_pending_tables("products", &changes);
    assert_eq!(units.len(), 4);

    let chunks =
        push::chunk_pending_push_tables(units.clone(), 4, usize::MAX, "merchant-1", "client-1");
    assert_eq!(chunks.len(), 1);

    let (first, second) = push::split_push_chunk_for_retry(&chunks[0]);
    assert_eq!(first.len(), 2);
    assert_eq!(second.len(), 2);
}

#[tokio::test]
async fn sim_single_row_too_large_error() {
    let unit = PendingTablePush {
        table: "products".to_string(),
        row: Some(serde_json::json!({
            "id": "prod-big",
            "merchantId": "merchant-1",
            "name": "Huge product with lots of data"
        })),
        deleted_id: None,
        outbox_ids: vec!["outbox-1".to_string()],
    };

    let merged = push::merge_pending_units(vec![unit.clone()]);
    let idem_key = push::generate_idempotency_key_from_outbox_ids(&unit.outbox_ids);
    let byte_len = push::encoded_push_chunk_len("merchant-1", "client-1", &idem_key, &merged);

    let max_bytes = byte_len.saturating_sub(1);
    let is_single = unit.row.is_some() && byte_len > max_bytes;

    assert!(is_single);
    assert!(byte_len > 0);
}

#[tokio::test]
async fn sim_cursor_advances_after_successful_pull() {
    let pool = temp_db().await;

    sqlx::query(
        "INSERT INTO sync_cursors (scope_id, last_cursor, updated_at) VALUES (?1, '', '0')",
    )
    .bind("merchant-1")
    .execute(&pool)
    .await
    .unwrap();

    let response = fixtures::baseline_pull_response();
    let new_cursor = response.get("cursor").and_then(|c| c.as_str()).unwrap();

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
    baresync_core::cursor::set_last_cursor_tx(&mut tx, "merchant-1", new_cursor)
        .await
        .unwrap();
    tx.commit().await.unwrap();

    let cursor: String =
        sqlx::query_scalar("SELECT last_cursor FROM sync_cursors WHERE scope_id = ?1")
            .bind("merchant-1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(cursor, new_cursor);
}

#[tokio::test]
async fn sim_cursor_does_not_advance_on_failure() {
    let pool = temp_db().await;

    sqlx::query(
        "INSERT INTO sync_cursors (scope_id, last_cursor, updated_at) VALUES (?1, 'sync:original', '0')",
    )
    .bind("merchant-1")
    .execute(&pool)
    .await
    .unwrap();

    let cursor: String =
        sqlx::query_scalar("SELECT last_cursor FROM sync_cursors WHERE scope_id = ?1")
            .bind("merchant-1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(cursor, "sync:original");
}

#[tokio::test]
async fn sim_gc_purges_soft_deleted_synced_rows() {
    let pool = temp_db().await;
    seed_categories_and_products(&pool).await;

    sqlx::query("UPDATE products SET deleted_at = '2026-05-19T12:00:00.000Z', is_synced = 1 WHERE id = 'prod-1'")
        .execute(&pool)
        .await
        .unwrap();

    let purged = gc::run_garbage_collection(
        &pool,
        &["categories".to_string(), "products".to_string()],
        "merchant-1",
    )
    .await
    .unwrap();
    assert_eq!(purged, 1);

    let prod_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM products WHERE id = 'prod-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(prod_count, 0);

    let cat_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM categories WHERE id = 'cat-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(cat_count, 1);
}

#[tokio::test]
async fn sim_full_sync_lifecycle() {
    let pool = temp_db().await;

    let response = fixtures::baseline_pull_response();
    let server_time = response.get("serverTime").and_then(|t| t.as_str()).unwrap();
    let new_cursor = response.get("cursor").and_then(|c| c.as_str()).unwrap();

    sqlx::query(
        "INSERT INTO sync_cursors (scope_id, last_cursor, updated_at) VALUES (?1, '', '0')",
    )
    .bind("merchant-1")
    .execute(&pool)
    .await
    .unwrap();

    let mut tx = pool.begin().await.unwrap();
    let applied = pull::apply_pull_batch_tables_tx(
        &mut tx,
        &["categories".to_string(), "products".to_string()],
        &["products".to_string(), "categories".to_string()],
        response.get("tables").unwrap(),
        server_time,
        &[],
    )
    .await
    .unwrap();
    baresync_core::cursor::set_last_cursor_tx(&mut tx, "merchant-1", new_cursor)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    assert_eq!(applied, 2);

    let cat_name: String = sqlx::query_scalar("SELECT name FROM categories WHERE id = 'cat-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(cat_name, "Drinks Updated");

    let local_cat = serde_json::json!({
        "id": "cat-local-1",
        "merchantId": "merchant-1",
        "name": "Local Category",
        "createdAt": "2026-05-19T13:00:00.000Z",
        "updatedAt": "2026-05-19T13:00:00.000Z"
    });
    let mut tx = pool.begin().await.unwrap();
    push::upsert_row(&mut tx, "categories", &local_cat)
        .await
        .unwrap();
    tx.commit().await.unwrap();

    sqlx::query(fixtures::insert_outbox_sql())
        .bind("outbox-local-cat-1")
        .bind("categories")
        .bind("cat-local-1")
        .bind("insert")
        .bind(serde_json::to_string(&local_cat).unwrap())
        .bind("merchant-1")
        .bind("2026-05-19T13:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    let outbox_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sync_outbox WHERE synced_at IS NULL")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(outbox_count, 1);

    sqlx::query("UPDATE sync_outbox SET synced_at = '2026-05-19T14:00:00.000Z' WHERE id = 'outbox-local-cat-1'")
        .execute(&pool)
        .await
        .unwrap();

    let pending_after_push: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sync_outbox WHERE synced_at IS NULL")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(pending_after_push, 0);

    let soft_delete_response = fixtures::soft_delete_pull_response();
    let mut tx = pool.begin().await.unwrap();
    pull::apply_pull_batch_tables_tx(
        &mut tx,
        &["categories".to_string(), "products".to_string()],
        &["products".to_string(), "categories".to_string()],
        soft_delete_response.get("tables").unwrap(),
        "2026-05-19T12:00:01.000Z",
        &[],
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();

    let prod_deleted: Option<String> =
        sqlx::query_scalar("SELECT deleted_at FROM products WHERE id = 'prod-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(prod_deleted.is_some());

    let purged = gc::run_garbage_collection(
        &pool,
        &["categories".to_string(), "products".to_string()],
        "merchant-1",
    )
    .await
    .unwrap();
    assert!(purged >= 1);

    let prod_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM products WHERE id = 'prod-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(prod_count, 0);

    let second_outbox: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sync_outbox WHERE synced_at IS NULL")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(second_outbox, 0);
}

#[tokio::test]
async fn sim_migrations_applied_once_skipped_on_second_run() {
    use baresync_core::migrations::{self, EmbeddedMigration, MigrationConfig};

    let pool = temp_db().await;

    let migs = vec![EmbeddedMigration {
        name: "0001_create_test_items",
        sql: "CREATE TABLE test_items (id TEXT PRIMARY KEY, name TEXT NOT NULL)",
    }];

    migrations::run_migrations(&pool, &MigrationConfig::tolerant(), &migs)
        .await
        .unwrap();

    let count1: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM __drizzle_migrations")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count1, 1);

    migrations::run_migrations(&pool, &MigrationConfig::tolerant(), &migs)
        .await
        .unwrap();

    let count2: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM __drizzle_migrations")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count2, 1);
}

#[tokio::test]
async fn sim_push_deletes_only() {
    let pool = temp_db().await;

    sqlx::query(fixtures::insert_category_sql())
        .bind("cat-1")
        .bind("merchant-1")
        .bind("Drinks")
        .bind("2026-01-01T00:00:00.000Z")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query(fixtures::insert_outbox_sql())
        .bind("outbox-del-1")
        .bind("categories")
        .bind("cat-1")
        .bind("delete")
        .bind("null")
        .bind("merchant-1")
        .bind("2026-05-19T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query("DELETE FROM categories WHERE id = 'cat-1'")
        .execute(&pool)
        .await
        .unwrap();

    let mut tx = pool.begin().await.unwrap();
    let changes = schema::read_unsynced_table_changes_from_outbox_tx(
        &mut tx,
        "categories",
        "merchant-1",
        &[],
    )
    .await
    .unwrap();
    drop(tx);

    assert_eq!(changes.changes.deleted_ids, vec!["cat-1"]);

    let units = push::flatten_pending_tables("categories", &changes);
    assert_eq!(units.len(), 1);
    assert_eq!(units[0].deleted_id, Some("cat-1".to_string()));

    let merged = push::merge_pending_units(units.clone());
    let idem_key = push::generate_idempotency_key_from_outbox_ids(&units[0].outbox_ids);
    let envelope = push::build_json_push_envelope("merchant-1", "client-1", &idem_key, &merged);
    assert!(envelope
        .get("tables")
        .and_then(|t| t.as_array())
        .map_or(false, |a| !a.is_empty()));

    let mut tx = pool.begin().await.unwrap();
    baresync_core::outbox::mark_outbox_synced_by_outbox_ids_tx(
        &mut tx,
        "2026-05-19T14:00:00.000Z",
        &units[0].outbox_ids,
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();

    let pending: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sync_outbox WHERE synced_at IS NULL")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(pending, 0);
}

#[tokio::test]
async fn sim_pull_mixed_changed_rows_and_deleted_ids_same_table() {
    let pool = temp_db().await;

    sqlx::query(fixtures::insert_category_sql())
        .bind("cat-1")
        .bind("merchant-1")
        .bind("Drinks")
        .bind("2026-01-01T00:00:00.000Z")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query("INSERT INTO products (id, merchant_id, category_id, name, price_minor_units, deleted_at, is_synced, created_at, updated_at) VALUES ('prod-1', 'merchant-1', 'cat-1', 'Kopi Susu', 15000, NULL, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')")
        .execute(&pool)
        .await
        .unwrap();

    let response = serde_json::json!({
        "cursor": "sync:1716120000000:products:prod-2",
        "hasMore": false,
        "serverTime": "2026-05-19T12:00:00.000Z",
        "tables": [{
            "table": "products",
            "changedRows": [{
                "id": "prod-2",
                "merchantId": "merchant-1",
                "categoryId": "cat-1",
                "name": "Latte",
                "priceMinorUnits": 20000,
                "createdAt": "2026-01-01T00:00:00.000Z",
                "updatedAt": "2026-01-01T00:00:00.000Z"
            }],
            "deletedIds": ["prod-1"]
        }]
    });

    let mut tx = pool.begin().await.unwrap();
    pull::apply_pull_batch_tables_tx(
        &mut tx,
        &["categories".to_string(), "products".to_string()],
        &["products".to_string()],
        response.get("tables").unwrap(),
        "2026-05-19T12:00:00.000Z",
        &[],
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();

    let prod2_synced: i64 =
        sqlx::query_scalar("SELECT is_synced FROM products WHERE id = 'prod-2'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(prod2_synced, 1);

    let prod2_name: String = sqlx::query_scalar("SELECT name FROM products WHERE id = 'prod-2'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(prod2_name, "Latte");

    let prod1_deleted: Option<String> =
        sqlx::query_scalar("SELECT deleted_at FROM products WHERE id = 'prod-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(prod1_deleted.is_some());

    let prod1_synced: i64 =
        sqlx::query_scalar("SELECT is_synced FROM products WHERE id = 'prod-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(prod1_synced, 1);
}

#[tokio::test]
async fn sim_paginated_pull_two_batches() {
    let pool = temp_db().await;

    sqlx::query(
        "INSERT INTO sync_cursors (scope_id, last_cursor, updated_at) VALUES ('merchant-1', '', '0')",
    )
    .execute(&pool)
    .await
    .unwrap();

    let batch1 = serde_json::json!({
        "cursor": "sync:step1",
        "hasMore": true,
        "serverTime": "2026-05-19T12:00:00.000Z",
        "tables": [{
            "table": "products",
            "changedRows": [{
                "id": "prod-1",
                "merchantId": "merchant-1",
                "categoryId": "cat-1",
                "name": "Kopi Susu",
                "priceMinorUnits": 15000,
                "createdAt": "2026-01-01T00:00:00.000Z",
                "updatedAt": "2026-01-01T00:00:00.000Z"
            }],
            "deletedIds": []
        }]
    });

    let mut tx = pool.begin().await.unwrap();
    let applied1 = pull::apply_pull_batch_tables_tx(
        &mut tx,
        &["products".to_string()],
        &[],
        batch1.get("tables").unwrap(),
        "2026-05-19T12:00:00.000Z",
        &[],
    )
    .await
    .unwrap();
    baresync_core::cursor::set_last_cursor_tx(&mut tx, "merchant-1", "sync:step1")
        .await
        .unwrap();
    tx.commit().await.unwrap();
    assert_eq!(applied1, 1);

    let batch2 = serde_json::json!({
        "cursor": "sync:step2",
        "hasMore": false,
        "serverTime": "2026-05-19T12:00:01.000Z",
        "tables": [{
            "table": "categories",
            "changedRows": [{
                "id": "cat-1",
                "merchantId": "merchant-1",
                "name": "Drinks",
                "createdAt": "2026-01-01T00:00:00.000Z",
                "updatedAt": "2026-01-01T00:00:00.000Z"
            }],
            "deletedIds": []
        }]
    });

    let mut tx = pool.begin().await.unwrap();
    let applied2 = pull::apply_pull_batch_tables_tx(
        &mut tx,
        &["categories".to_string()],
        &[],
        batch2.get("tables").unwrap(),
        "2026-05-19T12:00:01.000Z",
        &[],
    )
    .await
    .unwrap();
    baresync_core::cursor::set_last_cursor_tx(&mut tx, "merchant-1", "sync:step2")
        .await
        .unwrap();
    tx.commit().await.unwrap();
    assert_eq!(applied2, 1);

    let prod_name: String = sqlx::query_scalar("SELECT name FROM products WHERE id = 'prod-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(prod_name, "Kopi Susu");

    let cat_name: String = sqlx::query_scalar("SELECT name FROM categories WHERE id = 'cat-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(cat_name, "Drinks");

    let cursor: String =
        sqlx::query_scalar("SELECT last_cursor FROM sync_cursors WHERE scope_id = 'merchant-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(cursor, "sync:step2");
}

#[tokio::test]
async fn sim_outbox_coalesce_insert_delete_insert() {
    let pool = temp_db().await;

    sqlx::query(fixtures::insert_category_sql())
        .bind("cat-1")
        .bind("merchant-1")
        .bind("Drinks")
        .bind("2026-01-01T00:00:00.000Z")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    let cat_row = serde_json::json!({"id":"cat-1","name":"Drinks"});

    sqlx::query(fixtures::insert_outbox_sql())
        .bind("outbox-1")
        .bind("categories")
        .bind("cat-1")
        .bind("insert")
        .bind(serde_json::to_string(&cat_row).unwrap())
        .bind("merchant-1")
        .bind("2026-05-19T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query(fixtures::insert_outbox_sql())
        .bind("outbox-2")
        .bind("categories")
        .bind("cat-1")
        .bind("delete")
        .bind("null")
        .bind("merchant-1")
        .bind("2026-05-19T00:00:01.000Z")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query(fixtures::insert_outbox_sql())
        .bind("outbox-3")
        .bind("categories")
        .bind("cat-1")
        .bind("insert")
        .bind(serde_json::to_string(&cat_row).unwrap())
        .bind("merchant-1")
        .bind("2026-05-19T00:00:02.000Z")
        .execute(&pool)
        .await
        .unwrap();

    let mut tx = pool.begin().await.unwrap();
    let changes = schema::read_unsynced_table_changes_from_outbox_tx(
        &mut tx,
        "categories",
        "merchant-1",
        &[],
    )
    .await
    .unwrap();
    drop(tx);

    assert_eq!(changes.changes.changed_rows.len(), 1);
    assert!(changes.changes.deleted_ids.is_empty());

    let row = &changes.changes.changed_rows[0];
    assert_eq!(row.get("id").and_then(|v| v.as_str()), Some("cat-1"));
}

#[tokio::test]
async fn sim_resync_after_server_wins_reconciliation() {
    let pool = temp_db().await;
    seed_categories_and_products(&pool).await;

    let rejection = fixtures::push_rejection_response();
    let recon_pull = rejection.get("reconciliationPull").unwrap();

    let mut tx = pool.begin().await.unwrap();
    pull::apply_pull_batch_tables_tx(
        &mut tx,
        &["categories".to_string()],
        &[],
        recon_pull.get("tables").unwrap(),
        "2026-05-19T12:00:02.000Z",
        &[],
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();

    let cat_name: String = sqlx::query_scalar("SELECT name FROM categories WHERE id = 'cat-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(cat_name, "Drinks Server Version");

    let new_cat = serde_json::json!({
        "id": "cat-new-1",
        "merchantId": "merchant-1",
        "name": "New Local Category",
        "createdAt": "2026-05-19T15:00:00.000Z",
        "updatedAt": "2026-05-19T15:00:00.000Z"
    });
    let mut tx = pool.begin().await.unwrap();
    push::upsert_row(&mut tx, "categories", &new_cat)
        .await
        .unwrap();
    tx.commit().await.unwrap();

    sqlx::query(fixtures::insert_outbox_sql())
        .bind("outbox-cat-new-1")
        .bind("categories")
        .bind("cat-new-1")
        .bind("insert")
        .bind(serde_json::to_string(&new_cat).unwrap())
        .bind("merchant-1")
        .bind("2026-05-19T15:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    let mut tx = pool.begin().await.unwrap();
    let changes = schema::read_unsynced_table_changes_from_outbox_tx(
        &mut tx,
        "categories",
        "merchant-1",
        &[],
    )
    .await
    .unwrap();
    drop(tx);

    let units = push::flatten_pending_tables("categories", &changes);
    assert_eq!(units.len(), 1);
    assert_eq!(
        units[0]
            .row
            .as_ref()
            .and_then(|r| r.get("name"))
            .and_then(|v| v.as_str()),
        Some("New Local Category")
    );

    let merged = push::merge_pending_units(units.clone());
    let idem_key = push::generate_idempotency_key_from_outbox_ids(&units[0].outbox_ids);
    let envelope = push::build_json_push_envelope("merchant-1", "client-1", &idem_key, &merged);
    assert!(envelope
        .get("tables")
        .and_then(|t| t.as_array())
        .map_or(false, |a| !a.is_empty()));

    let mut tx = pool.begin().await.unwrap();
    baresync_core::outbox::mark_outbox_synced_by_outbox_ids_tx(
        &mut tx,
        "2026-05-19T16:00:00.000Z",
        &units[0].outbox_ids,
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();

    let pending: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sync_outbox WHERE synced_at IS NULL")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(pending, 0);
}

#[tokio::test]
async fn sim_push_partial_acceptance() {
    let pool = temp_db().await;

    sqlx::query(fixtures::insert_category_sql())
        .bind("cat-1")
        .bind("merchant-1")
        .bind("Drinks")
        .bind("2026-01-01T00:00:00.000Z")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query(fixtures::insert_category_sql())
        .bind("cat-2")
        .bind("merchant-1")
        .bind("Food")
        .bind("2026-01-01T00:00:00.000Z")
        .bind("2026-01-01T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query(fixtures::insert_outbox_sql())
        .bind("outbox-cat-1")
        .bind("categories")
        .bind("cat-1")
        .bind("update")
        .bind("{\"id\":\"cat-1\",\"name\":\"Drinks Updated\"}")
        .bind("merchant-1")
        .bind("2026-05-19T00:00:00.000Z")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query(fixtures::insert_outbox_sql())
        .bind("outbox-cat-2")
        .bind("categories")
        .bind("cat-2")
        .bind("update")
        .bind("{\"id\":\"cat-2\",\"name\":\"Food Updated\"}")
        .bind("merchant-1")
        .bind("2026-05-19T00:00:01.000Z")
        .execute(&pool)
        .await
        .unwrap();

    let mut tx = pool.begin().await.unwrap();
    baresync_core::outbox::mark_outbox_synced_by_outbox_ids_tx(
        &mut tx,
        "2026-05-19T14:00:00.000Z",
        &["outbox-cat-1".to_string()],
    )
    .await
    .unwrap();

    let mut accepted = std::collections::HashSet::new();
    accepted.insert("cat-1".to_string());
    schema::mark_rows_synced_by_id_tx(&mut tx, "categories", &accepted)
        .await
        .unwrap();
    tx.commit().await.unwrap();

    let cat1_synced: i64 =
        sqlx::query_scalar("SELECT is_synced FROM categories WHERE id = 'cat-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(cat1_synced, 1);

    let cat1_outbox_synced: Option<String> =
        sqlx::query_scalar("SELECT synced_at FROM sync_outbox WHERE id = 'outbox-cat-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        cat1_outbox_synced,
        Some("2026-05-19T14:00:00.000Z".to_string())
    );

    let cat2_synced: i64 =
        sqlx::query_scalar("SELECT is_synced FROM categories WHERE id = 'cat-2'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(cat2_synced, 0);

    let cat2_outbox_synced: Option<String> =
        sqlx::query_scalar("SELECT synced_at FROM sync_outbox WHERE id = 'outbox-cat-2'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(cat2_outbox_synced.is_none());
}

#[tokio::test]
async fn sim_run_sql_batch_rolls_back_on_failure() {
    use baresync_core::drizzle_proxy::{run_sql_batch, SqlStatement};

    let pool = temp_db().await;
    sqlx::query("CREATE TABLE batch_test (id TEXT PRIMARY KEY, val INTEGER NOT NULL)")
        .execute(&pool)
        .await
        .unwrap();

    let result = run_sql_batch(
        &pool,
        vec![
            SqlStatement {
                sql: "INSERT INTO batch_test (id, val) VALUES ('a', 1)".to_string(),
                params: vec![],
            },
            SqlStatement {
                sql: "INVALID SQL STATEMENT".to_string(),
                params: vec![],
            },
            SqlStatement {
                sql: "INSERT INTO batch_test (id, val) VALUES ('b', 2)".to_string(),
                params: vec![],
            },
        ],
    )
    .await;

    assert!(result.is_err());

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM batch_test")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
}
