use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::fs;
use std::path::{Path, PathBuf};

use crate::error::SyncError;

#[derive(Clone, Debug)]
pub struct EmbeddedMigration {
    pub name: &'static str,
    pub sql: &'static str,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MigrationFile {
    pub name: String,
    pub file_name: String,
    pub path: PathBuf,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct MigrationConfig {
    #[serde(default = "default_strict")]
    pub strict: bool,
}

fn default_strict() -> bool {
    true
}

impl MigrationConfig {
    pub fn strict() -> Self {
        Self { strict: true }
    }

    pub fn tolerant() -> Self {
        Self { strict: false }
    }
}

#[derive(Debug, Serialize)]
pub struct MigrationRecord {
    pub hash: String,
    pub created_at: i64,
}

pub fn collect_migration_files(dir: impl AsRef<Path>) -> Result<Vec<MigrationFile>, String> {
    let mut migrations = Vec::new();

    let entries = fs::read_dir(dir.as_ref())
        .map_err(|e| format!("Failed to read migration directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read migration entry: {}", e))?;
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|ext| ext.to_str()) != Some("sql") {
            continue;
        }

        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| format!("Invalid migration file name: {}", path.display()))?
            .to_owned();

        let name = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .ok_or_else(|| format!("Invalid migration file stem: {}", path.display()))?
            .to_owned();

        migrations.push(MigrationFile {
            name,
            file_name,
            path,
        });
    }

    migrations.sort_by(|left, right| left.file_name.cmp(&right.file_name));
    Ok(migrations)
}

pub async fn run_migrations(
    pool: &SqlitePool,
    config: &MigrationConfig,
    migrations: &[EmbeddedMigration],
) -> Result<(), SyncError> {
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
                    if !config.strict && (msg.contains("already exists") || msg.contains("duplicate column")) {
                        continue;
                    }
                    return Err(SyncError::Migration(format!(
                        "Migration {} failed: {}",
                        migration.name, e
                    )));
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

pub async fn get_migration_status(pool: &SqlitePool) -> Result<Vec<MigrationRecord>, SyncError> {
    let rows = sqlx::query_as::<_, (String, i64)>(
        "SELECT hash, created_at FROM __drizzle_migrations ORDER BY id",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| SyncError::Migration(format!("Failed to query migration status: {}", e)))?;

    Ok(rows
        .into_iter()
        .map(|(hash, created_at)| MigrationRecord { hash, created_at })
        .collect())
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
    use std::time::{SystemTime, UNIX_EPOCH};

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

    #[test]
    fn collect_migration_files_sorts_and_filters() {
        let dir = std::env::temp_dir().join(format!(
            "baresync-migration-test-{}-{}",
            std::process::id(),
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("0002_second.sql"), "SELECT 2;").unwrap();
        std::fs::write(dir.join("README.txt"), "ignore").unwrap();
        std::fs::write(dir.join("0001_first.sql"), "SELECT 1;").unwrap();

        let migrations = collect_migration_files(&dir).unwrap();

        assert_eq!(
            migrations.iter().map(|m| m.file_name.as_str()).collect::<Vec<_>>(),
            vec!["0001_first.sql", "0002_second.sql"]
        );
        assert_eq!(
            migrations.iter().map(|m| m.name.as_str()).collect::<Vec<_>>(),
            vec!["0001_first", "0002_second"]
        );

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[tokio::test]
    async fn fresh_db_applies_all_migrations() {
        let pool = test_pool().await;
        let migrations = vec![
            EmbeddedMigration {
                name: "0001_create_categories",
                sql: "CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL)",
            },
            EmbeddedMigration {
                name: "0002_create_products",
                sql: "CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT NOT NULL, category_id TEXT)",
            },
        ];
        run_migrations(&pool, &MigrationConfig::tolerant(), &migrations).await.unwrap();

        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM __drizzle_migrations")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(count, 2);
    }

    #[tokio::test]
    async fn strict_mode_failing_second_statement_rolls_back() {
        let pool = test_pool().await;
        let migrations = vec![EmbeddedMigration {
            name: "0001_strict_fail",
            sql: "CREATE TABLE strict_table (id TEXT PRIMARY KEY)\n--> statement-breakpoint\nSELECT * FROM nonexistent_xyz",
        }];

        let result = run_migrations(&pool, &MigrationConfig::strict(), &migrations).await;
        assert!(result.is_err());

        let exists: bool = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='strict_table'",
        )
        .fetch_one(&pool)
        .await
        .map(|c| c > 0)
        .unwrap_or(false);
        assert!(!exists, "First statement should have been rolled back");
    }

    #[tokio::test]
    async fn second_run_skips_applied_migrations() {
        let pool = test_pool().await;
        let migrations = vec![EmbeddedMigration {
            name: "0001_create_table",
            sql: "CREATE TABLE test_table (id TEXT PRIMARY KEY)",
        }];
        run_migrations(&pool, &MigrationConfig::tolerant(), &migrations).await.unwrap();
        run_migrations(&pool, &MigrationConfig::tolerant(), &migrations).await.unwrap();

        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM __drizzle_migrations")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(count, 1);
    }

    #[tokio::test]
    async fn tolerant_mode_skips_already_exists() {
        let pool = test_pool().await;
        let migrations = vec![EmbeddedMigration {
            name: "0001_tolerant_exists",
            sql: "CREATE TABLE tolerant_t (id TEXT PRIMARY KEY)",
        }];
        run_migrations(&pool, &MigrationConfig::tolerant(), &migrations).await.unwrap();
        run_migrations(&pool, &MigrationConfig::tolerant(), &migrations).await.unwrap();

        let exists: bool = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='tolerant_t'",
        )
        .fetch_one(&pool)
        .await
        .map(|c| c > 0)
        .unwrap_or(false);
        assert!(exists);
    }

    #[tokio::test]
    async fn tolerant_mode_skips_duplicate_column() {
        let pool = test_pool().await;
        let migrations_first = vec![EmbeddedMigration {
            name: "0001_setup",
            sql: "CREATE TABLE dup_col_t (id TEXT PRIMARY KEY, name TEXT NOT NULL)",
        }];
        let migrations_dup = vec![EmbeddedMigration {
            name: "0002_dup_col",
            sql: "ALTER TABLE dup_col_t ADD COLUMN name TEXT",
        }];

        run_migrations(&pool, &MigrationConfig::tolerant(), &migrations_first).await.unwrap();
        let result = run_migrations(&pool, &MigrationConfig::tolerant(), &migrations_dup).await;
        assert!(result.is_ok(), "Tolerant mode should skip duplicate column error");
    }

    #[tokio::test]
    async fn get_migration_status_returns_applied() {
        let pool = test_pool().await;
        let migrations = vec![
            EmbeddedMigration {
                name: "0001_alpha",
                sql: "CREATE TABLE alpha (id TEXT PRIMARY KEY)",
            },
            EmbeddedMigration {
                name: "0002_beta",
                sql: "CREATE TABLE beta (id TEXT PRIMARY KEY)",
            },
            EmbeddedMigration {
                name: "0003_gamma",
                sql: "CREATE TABLE gamma (id TEXT PRIMARY KEY)",
            },
        ];
        run_migrations(&pool, &MigrationConfig::strict(), &migrations).await.unwrap();

        let status = get_migration_status(&pool).await.unwrap();
        assert_eq!(status.len(), 3);
        assert_eq!(status[0].hash, "0001_alpha");
        assert_eq!(status[1].hash, "0002_beta");
        assert_eq!(status[2].hash, "0003_gamma");
    }

    #[tokio::test]
    async fn rerun_after_fix_succeeds() {
        let pool = test_pool().await;
        let bad = vec![EmbeddedMigration {
            name: "0001_fixable",
            sql: "INVALID SQL",
        }];
        assert!(run_migrations(&pool, &MigrationConfig::tolerant(), &bad).await.is_err());

        let good = vec![EmbeddedMigration {
            name: "0001_fixable",
            sql: "CREATE TABLE fixed_table (id TEXT PRIMARY KEY)",
        }];
        run_migrations(&pool, &MigrationConfig::tolerant(), &good).await.unwrap();

        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM __drizzle_migrations")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(count, 1);
    }
}
