use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use crate::db::DbClient;
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
    db: &DbClient,
    config: &MigrationConfig,
    migrations: &[EmbeddedMigration],
) -> Result<(), SyncError> {
    ensure_migration_table(db).await?;

    for migration in migrations {
        apply_migration(db, config, migration.name, migration.sql).await?;
    }

    Ok(())
}

pub async fn run_migration_files(
    db: &DbClient,
    config: &MigrationConfig,
    dir: impl AsRef<Path>,
) -> Result<(), SyncError> {
    ensure_migration_table(db).await?;

    let migrations = collect_migration_files(dir).map_err(SyncError::Migration)?;
    for migration in migrations {
        let sql = fs::read_to_string(&migration.path).map_err(|e| {
            SyncError::Migration(format!(
                "Failed to read migration file {}: {}",
                migration.path.display(),
                e
            ))
        })?;
        apply_migration(db, config, &migration.name, &sql).await?;
    }

    Ok(())
}

async fn ensure_migration_table(db: &DbClient) -> Result<(), SyncError> {
    db.execute(
        "CREATE TABLE IF NOT EXISTS __drizzle_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hash TEXT NOT NULL UNIQUE,
            created_at INTEGER NOT NULL
        )",
        vec![],
    )
    .await
    .map_err(|e| {
        SyncError::Migration(format!("Failed to create migration tracking table: {}", e))
    })?;

    Ok(())
}

async fn apply_migration(
    db: &DbClient,
    config: &MigrationConfig,
    name: &str,
    sql: &str,
) -> Result<(), SyncError> {
    db.apply_migration(name, sql, config.strict, chrono_now_ms())
        .await
        .map_err(|e| SyncError::Migration(e.to_string()))?;

    Ok(())
}

pub async fn get_migration_status(db: &DbClient) -> Result<Vec<MigrationRecord>, SyncError> {
    let rows = db
        .query(
            "SELECT hash, created_at FROM __drizzle_migrations ORDER BY id",
            vec![],
        )
        .await
        .map_err(|e| SyncError::Migration(format!("Failed to query migration status: {}", e)))?;

    Ok(rows
        .into_iter()
        .map(|row| MigrationRecord {
            hash: row
                .values
                .first()
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .to_string(),
            created_at: row
                .values
                .get(1)
                .and_then(|value| value.as_i64())
                .unwrap_or_default(),
        })
        .collect())
}

fn chrono_now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[cfg(test)]
async fn scalar_i64(db: &DbClient, sql: &str) -> i64 {
    db.query(sql, vec![])
        .await
        .unwrap()
        .first()
        .and_then(|row| row.values.first())
        .and_then(|value| value.as_i64())
        .unwrap_or_default()
}

#[cfg(test)]
async fn scalar_string(db: &DbClient, sql: &str) -> String {
    db.query(sql, vec![])
        .await
        .unwrap()
        .first()
        .and_then(|row| row.values.first())
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::DbClient;
    use std::time::{SystemTime, UNIX_EPOCH};

    async fn test_pool() -> DbClient {
        DbClient::connect(":memory:").await.unwrap()
    }

    #[test]
    fn collect_migration_files_sorts_and_filters() {
        let dir = std::env::temp_dir().join(format!(
            "baresync-migration-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("0002_second.sql"), "SELECT 2;").unwrap();
        std::fs::write(dir.join("README.txt"), "ignore").unwrap();
        std::fs::write(dir.join("0001_first.sql"), "SELECT 1;").unwrap();

        let migrations = collect_migration_files(&dir).unwrap();

        assert_eq!(
            migrations
                .iter()
                .map(|m| m.file_name.as_str())
                .collect::<Vec<_>>(),
            vec!["0001_first.sql", "0002_second.sql"]
        );
        assert_eq!(
            migrations
                .iter()
                .map(|m| m.name.as_str())
                .collect::<Vec<_>>(),
            vec!["0001_first", "0002_second"]
        );

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[tokio::test]
    async fn migration_files_apply_in_filename_order() {
        let dir = std::env::temp_dir().join(format!(
            "baresync-migration-file-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("0002_insert_item.sql"),
            "INSERT INTO items (id, name) VALUES ('item-1', 'Coffee')",
        )
        .unwrap();
        fs::write(
            dir.join("0001_create_items.sql"),
            "CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT NOT NULL)",
        )
        .unwrap();

        let db = test_pool().await;
        run_migration_files(&db, &MigrationConfig::strict(), &dir)
            .await
            .unwrap();

        let name = scalar_string(&db, "SELECT name FROM items WHERE id = 'item-1'").await;
        assert_eq!(name, "Coffee");

        let status = get_migration_status(&db).await.unwrap();
        assert_eq!(status.len(), 2);
        assert_eq!(status[0].hash, "0001_create_items");
        assert_eq!(status[1].hash, "0002_insert_item");

        let _ = fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn fresh_db_applies_all_migrations() {
        let db = test_pool().await;
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
        run_migrations(&db, &MigrationConfig::tolerant(), &migrations)
            .await
            .unwrap();

        let count = scalar_i64(&db, "SELECT COUNT(*) FROM __drizzle_migrations").await;
        assert_eq!(count, 2);
    }

    #[tokio::test]
    async fn migration_without_breakpoints_applies_all_semicolon_statements() {
        let db = test_pool().await;
        let migrations = vec![EmbeddedMigration {
            name: "0001_plain_sql",
            sql: "
                CREATE TABLE first_table (id TEXT PRIMARY KEY);
                CREATE TABLE second_table (id TEXT PRIMARY KEY);
            ",
        }];

        run_migrations(&db, &MigrationConfig::strict(), &migrations)
            .await
            .unwrap();

        let first_exists = scalar_i64(
            &db,
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='first_table'",
        )
        .await;
        let second_exists = scalar_i64(
            &db,
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='second_table'",
        )
        .await;
        assert_eq!(first_exists, 1);
        assert_eq!(second_exists, 1);
    }

    #[tokio::test]
    async fn strict_mode_failing_second_statement_rolls_back() {
        let pool = test_pool().await;
        let db = pool.clone();
        let migrations = vec![EmbeddedMigration {
            name: "0001_strict_fail",
            sql: "CREATE TABLE strict_table (id TEXT PRIMARY KEY)\n--> statement-breakpoint\nSELECT * FROM nonexistent_xyz",
        }];

        let result = run_migrations(&db, &MigrationConfig::strict(), &migrations).await;
        assert!(result.is_err());

        let exists = scalar_i64(
            &pool,
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='strict_table'",
        )
        .await
            > 0;
        assert!(!exists, "First statement should have been rolled back");
    }

    #[tokio::test]
    async fn migration_sql_rolls_back_when_recording_fails() {
        let db = test_pool().await;
        run_migrations(&db, &MigrationConfig::strict(), &[])
            .await
            .unwrap();
        db.execute(
            "CREATE TRIGGER fail_migration_record
             BEFORE INSERT ON __drizzle_migrations
             BEGIN
                SELECT RAISE(ABORT, 'record blocked');
             END",
            vec![],
        )
        .await
        .unwrap();

        let migrations = vec![EmbeddedMigration {
            name: "0001_create_atomic_table",
            sql: "CREATE TABLE atomic_table (id TEXT PRIMARY KEY)",
        }];

        let result = run_migrations(&db, &MigrationConfig::strict(), &migrations).await;

        assert!(result.is_err());
        let exists = scalar_i64(
            &db,
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='atomic_table'",
        )
        .await;
        assert_eq!(
            exists, 0,
            "migration SQL should roll back when migration recording fails"
        );
    }

    #[tokio::test]
    async fn second_run_skips_applied_migrations() {
        let pool = test_pool().await;
        let db = pool.clone();
        let migrations = vec![EmbeddedMigration {
            name: "0001_create_table",
            sql: "CREATE TABLE test_table (id TEXT PRIMARY KEY)",
        }];
        run_migrations(&db, &MigrationConfig::tolerant(), &migrations)
            .await
            .unwrap();
        run_migrations(&db, &MigrationConfig::tolerant(), &migrations)
            .await
            .unwrap();

        let count = scalar_i64(&db, "SELECT COUNT(*) FROM __drizzle_migrations").await;
        assert_eq!(count, 1);
    }

    #[tokio::test]
    async fn tolerant_mode_skips_already_exists() {
        let pool = test_pool().await;
        let db = pool.clone();
        let migrations = vec![EmbeddedMigration {
            name: "0001_tolerant_exists",
            sql: "CREATE TABLE tolerant_t (id TEXT PRIMARY KEY)",
        }];
        run_migrations(&db, &MigrationConfig::tolerant(), &migrations)
            .await
            .unwrap();
        run_migrations(&db, &MigrationConfig::tolerant(), &migrations)
            .await
            .unwrap();

        let exists = scalar_i64(
            &db,
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='tolerant_t'",
        )
        .await
            > 0;
        assert!(exists);
    }

    #[tokio::test]
    async fn tolerant_mode_skips_duplicate_column() {
        let pool = test_pool().await;
        let db = pool.clone();
        let migrations_first = vec![EmbeddedMigration {
            name: "0001_setup",
            sql: "CREATE TABLE dup_col_t (id TEXT PRIMARY KEY, name TEXT NOT NULL)",
        }];
        let migrations_dup = vec![EmbeddedMigration {
            name: "0002_dup_col",
            sql: "ALTER TABLE dup_col_t ADD COLUMN name TEXT",
        }];

        run_migrations(&db, &MigrationConfig::tolerant(), &migrations_first)
            .await
            .unwrap();
        let result = run_migrations(&db, &MigrationConfig::tolerant(), &migrations_dup).await;
        assert!(
            result.is_ok(),
            "Tolerant mode should skip duplicate column error"
        );
    }

    #[tokio::test]
    async fn get_migration_status_returns_applied() {
        let pool = test_pool().await;
        let db = pool.clone();
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
        run_migrations(&db, &MigrationConfig::strict(), &migrations)
            .await
            .unwrap();

        let status = get_migration_status(&db).await.unwrap();
        assert_eq!(status.len(), 3);
        assert_eq!(status[0].hash, "0001_alpha");
        assert_eq!(status[1].hash, "0002_beta");
        assert_eq!(status[2].hash, "0003_gamma");
    }

    #[tokio::test]
    async fn rerun_after_fix_succeeds() {
        let pool = test_pool().await;
        let db = pool.clone();
        let bad = vec![EmbeddedMigration {
            name: "0001_fixable",
            sql: "INVALID SQL",
        }];
        assert!(run_migrations(&db, &MigrationConfig::tolerant(), &bad)
            .await
            .is_err());

        let good = vec![EmbeddedMigration {
            name: "0001_fixable",
            sql: "CREATE TABLE fixed_table (id TEXT PRIMARY KEY)",
        }];
        run_migrations(&db, &MigrationConfig::tolerant(), &good)
            .await
            .unwrap();

        let count = scalar_i64(&db, "SELECT COUNT(*) FROM __drizzle_migrations").await;
        assert_eq!(count, 1);
    }
}
