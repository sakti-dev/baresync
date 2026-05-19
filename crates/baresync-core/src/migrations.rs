use sqlx::SqlitePool;

use crate::error::SyncError;

#[derive(Clone, Debug)]
pub struct MigrationFile {
    pub name: &'static str,
    pub sql: &'static str,
}

pub async fn run_migrations(pool: &SqlitePool, migrations: &[MigrationFile]) -> Result<(), SyncError> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS __drizzle_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hash TEXT NOT NULL UNIQUE,
            created_at INTEGER NOT NULL
        )",
    )
    .execute(pool)
    .await
    .map_err(|e| SyncError::Migration(format!("Failed to create migration tracking table: {}", e)))?;

    for migration in migrations {
        let applied: bool = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM __drizzle_migrations WHERE hash = $1",
        )
        .bind(migration.name)
        .fetch_one(pool)
        .await
        .map(|c| c > 0)
        .map_err(|e| SyncError::Migration(format!("Failed to check migration status: {}", e)))?;

        if applied {
            continue;
        }

        let mut tx = pool
            .begin()
            .await
            .map_err(|e| SyncError::Migration(format!("Failed to begin migration transaction: {}", e)))?;

        for statement in migration.sql.split("--> statement-breakpoint") {
            let stmt = statement.trim();
            if !stmt.is_empty() {
                if let Err(e) = sqlx::query(stmt).execute(&mut *tx).await {
                    let msg = e.to_string();
                    if msg.contains("already exists") || msg.contains("duplicate column") {
                        log::info!(
                            "[BARESYNC] [DB:MIGRATION_SKIP] Migration statement skipped: {}",
                            msg
                        );
                    } else {
                        return Err(SyncError::Migration(format!(
                            "Migration {} failed: {}",
                            migration.name, e
                        )));
                    }
                }
            }
        }

        sqlx::query("INSERT INTO __drizzle_migrations (hash, created_at) VALUES ($1, $2)")
            .bind(migration.name)
            .bind(chrono_now_ms())
            .execute(&mut *tx)
            .await
            .map_err(|e| SyncError::Migration(format!("Failed to record migration {}: {}", migration.name, e)))?;

        tx.commit()
            .await
            .map_err(|e| SyncError::Migration(format!("Failed to commit migration {}: {}", migration.name, e)))?;
    }

    Ok(())
}

fn chrono_now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;
    use std::str::FromStr;

    async fn test_pool() -> SqlitePool {
        let options = sqlx::sqlite::SqliteConnectOptions::from_str("sqlite::memory:")
            .unwrap()
            .pragma("foreign_keys", "ON");
        SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn fresh_db_applies_all_migrations() {
        let pool = test_pool().await;
        let migrations = vec![
            MigrationFile {
                name: "0001_create_categories",
                sql: "CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL)",
            },
            MigrationFile {
                name: "0002_create_products",
                sql: "CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT NOT NULL, category_id TEXT)",
            },
        ];
        run_migrations(&pool, &migrations).await.unwrap();

        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM __drizzle_migrations")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(count, 2);
    }

    #[tokio::test]
    async fn second_run_skips_applied_migrations() {
        let pool = test_pool().await;
        let migrations = vec![MigrationFile {
            name: "0001_create_table",
            sql: "CREATE TABLE test_table (id TEXT PRIMARY KEY)",
        }];
        run_migrations(&pool, &migrations).await.unwrap();
        run_migrations(&pool, &migrations).await.unwrap();

        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM __drizzle_migrations")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(count, 1);
    }

    #[tokio::test]
    async fn failed_migration_rolls_back() {
        let pool = test_pool().await;
        let migrations = vec![MigrationFile {
            name: "0001_fail_test",
            sql: "CREATE TABLE should_not_exist (id TEXT PRIMARY KEY)\n--> statement-breakpoint\nSELECT * FROM nonexistent_table_xyz",
        }];

        let result = run_migrations(&pool, &migrations).await;
        assert!(result.is_err());

        let exists: bool = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='should_not_exist'",
        )
        .fetch_one(&pool)
        .await
        .map(|c| c > 0)
        .unwrap_or(false);
        assert!(!exists, "First statement should have been rolled back");
    }

    #[tokio::test]
    async fn rerun_after_fix_succeeds() {
        let pool = test_pool().await;
        let bad = vec![MigrationFile {
            name: "0001_fixable",
            sql: "INVALID SQL",
        }];
        assert!(run_migrations(&pool, &bad).await.is_err());

        let good = vec![MigrationFile {
            name: "0001_fixable",
            sql: "CREATE TABLE fixed_table (id TEXT PRIMARY KEY)",
        }];
        run_migrations(&pool, &good).await.unwrap();

        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM __drizzle_migrations")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(count, 1);
    }
}
