use baresync_core::db::DbClient;
use baresync_core::drizzle_proxy::{run_sql_batch, SqlStatement};
use serde_json::Value;

#[tokio::test]
async fn db_client_serializes_concurrent_write_submissions() {
    let client = DbClient::connect(":memory:")
        .await
        .expect("DbClient should be connectable in tests");

    client
        .execute(
            "CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT NOT NULL)",
            vec![],
        )
        .await
        .expect("table should be created");

    let first = client.clone();
    let second = client.clone();

    let first_insert = tokio::spawn(async move {
        first
            .execute(
                "INSERT INTO items (id, name) VALUES (?1, ?2)",
                vec![
                    Value::String("item-1".to_string()),
                    Value::String("first".to_string()),
                ],
            )
            .await
    });

    let second_insert = tokio::spawn(async move {
        second
            .execute(
                "INSERT INTO items (id, name) VALUES (?1, ?2)",
                vec![
                    Value::String("item-2".to_string()),
                    Value::String("second".to_string()),
                ],
            )
            .await
    });

    first_insert
        .await
        .expect("first task should join")
        .expect("first insert should succeed");
    second_insert
        .await
        .expect("second task should join")
        .expect("second insert should succeed");

    let rows = client
        .query("SELECT id, name FROM items ORDER BY id", vec![])
        .await
        .expect("query should succeed");

    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].columns, vec!["id".to_string(), "name".to_string()]);
    assert_eq!(rows[1].columns, vec!["id".to_string(), "name".to_string()]);
}

#[tokio::test]
async fn run_sql_batch_rolls_back_all_statements_on_failure() {
    let client = DbClient::connect(":memory:")
        .await
        .expect("DbClient should be connectable in tests");

    client
        .execute(
            "CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT NOT NULL)",
            vec![],
        )
        .await
        .expect("table should be created");

    let result = run_sql_batch(
        &client,
        vec![
            SqlStatement {
                sql: "INSERT INTO items (id, name) VALUES ('item-1', 'Coffee')".to_string(),
                params: vec![],
            },
            SqlStatement {
                sql: "INSERT INTO missing_table (id, name) VALUES ('item-2', 'Tea')".to_string(),
                params: vec![],
            },
        ],
    )
    .await;

    assert!(result.is_err(), "the batch should fail");

    let rows = client
        .query("SELECT id, name FROM items", vec![])
        .await
        .expect("query should succeed");
    assert!(rows.is_empty(), "the failed batch should roll back");
}

#[tokio::test]
async fn batch_transactions_do_not_interleave_unrelated_requests() {
    let client = DbClient::connect(":memory:")
        .await
        .expect("DbClient should be connectable in tests");

    client
        .execute(
            "CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT NOT NULL)",
            vec![],
        )
        .await
        .expect("table should be created");
    client
        .execute("CREATE TABLE audit_log (message TEXT NOT NULL)", vec![])
        .await
        .expect("audit table should be created");

    let batch_client = client.clone();
    let batch = tokio::spawn(async move {
        run_sql_batch(
            &batch_client,
            vec![
                SqlStatement {
                    sql: "INSERT INTO items (id, name) VALUES ('item-1', 'Coffee')".to_string(),
                    params: vec![],
                },
                SqlStatement {
                    sql: "INSERT INTO items (id, name) VALUES ('item-2', 'Tea')".to_string(),
                    params: vec![],
                },
            ],
        )
        .await
    });

    let unrelated_client = client.clone();
    let unrelated = tokio::spawn(async move {
        unrelated_client
            .execute(
                "INSERT INTO audit_log (message) VALUES ('background sync')",
                vec![],
            )
            .await
    });

    batch
        .await
        .expect("batch task should join")
        .expect("batch should succeed");
    unrelated
        .await
        .expect("unrelated task should join")
        .expect("unrelated write should succeed");

    let rows = client
        .query("SELECT id FROM items ORDER BY id", vec![])
        .await
        .expect("query should succeed");
    assert_eq!(rows.len(), 2);
}
