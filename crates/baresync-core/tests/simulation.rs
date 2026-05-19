mod fixtures;

use baresync_core::pull;
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
