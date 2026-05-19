use serde_json::{json, Value};

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

pub fn insert_category_sql() -> &'static str {
    "
    INSERT INTO categories (id, merchant_id, name, sort_order, deleted_at, is_synced, created_at, updated_at)
    VALUES (?1, ?2, ?3, 0, NULL, 0, ?4, ?5);
    "
}
