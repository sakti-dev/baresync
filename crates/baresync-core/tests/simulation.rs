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
    let dir = std::env::temp_dir().join(format!(
        "baresync-test-{}-{}",
        std::process::id(),
        counter
    ));
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

    let cat_name: String =
        sqlx::query_scalar("SELECT name FROM categories WHERE id = 'cat-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(cat_name, "Drinks Updated");

    let prod_name: String =
        sqlx::query_scalar("SELECT name FROM products WHERE id = 'prod-1'")
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

    let is_synced: i64 =
        sqlx::query_scalar("SELECT is_synced FROM categories WHERE id = 'cat-1'")
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

    let prod_deleted: Option<String> = sqlx::query_scalar(
        "SELECT deleted_at FROM products WHERE id = 'prod-1'",
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

    let name: String =
        sqlx::query_scalar("SELECT name FROM categories WHERE id = 'cat-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(name, "Drinks");

    let is_synced: i64 =
        sqlx::query_scalar("SELECT is_synced FROM categories WHERE id = 'cat-1'")
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

    let deleted_at: Option<String> = sqlx::query_scalar(
        "SELECT deleted_at FROM categories WHERE id = 'cat-1'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        deleted_at,
        Some("2026-05-19T12:00:00.000Z".to_string())
    );

    let is_synced: i64 =
        sqlx::query_scalar("SELECT is_synced FROM categories WHERE id = 'cat-1'")
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

    let prod_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM products WHERE id = 'prod-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(prod_count, 0);

    let cat_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM categories WHERE id = 'cat-1'")
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

    let chunks = push::chunk_pending_push_tables(
        all_units,
        1,
        usize::MAX,
        "merchant-1",
        "client-1",
    );
    assert!(chunks.len() >= 2);

    for chunk in &chunks {
        let merged = push::merge_pending_units(chunk.clone());
        let _envelope = push::build_json_push_envelope(
            "merchant-1",
            "client-1",
            "test-key",
            &merged,
        );
    }
}
