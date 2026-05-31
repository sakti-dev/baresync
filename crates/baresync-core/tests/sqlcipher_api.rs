use std::convert::TryFrom;
use std::path::PathBuf;

use baresync_core::db::{DatabaseKey, DbClient, EncryptionKeyContext, EncryptionKeyProvider};

#[cfg(feature = "sqlcipher")]
use std::sync::Arc;

#[cfg(feature = "sqlcipher")]
use baresync_core::migrations::{self, EmbeddedMigration, MigrationConfig};

#[cfg(feature = "sqlcipher")]
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(not(feature = "sqlcipher"))]
#[derive(Clone, Default)]
struct TestKeyProvider;

#[cfg(not(feature = "sqlcipher"))]
impl EncryptionKeyProvider for TestKeyProvider {
    fn encryption_key(
        &self,
        context: EncryptionKeyContext,
    ) -> Result<DatabaseKey, Box<dyn std::error::Error + Send + Sync>> {
        assert!(context.db_path.ends_with(PathBuf::from("sqlcipher-test.db")));
        DatabaseKey::try_from(vec![0xAB; 32]).map_err(|error| error.into())
    }
}

#[cfg(feature = "sqlcipher")]
#[derive(Clone)]
struct FixedKeyProvider {
    key: DatabaseKey,
}

#[cfg(feature = "sqlcipher")]
impl EncryptionKeyProvider for FixedKeyProvider {
    fn encryption_key(
        &self,
        context: EncryptionKeyContext,
    ) -> Result<DatabaseKey, Box<dyn std::error::Error + Send + Sync>> {
        assert!(context.db_path.file_name().is_some());
        Ok(self.key.clone())
    }
}

#[test]
fn database_key_debug_redacts_material() {
    let key = DatabaseKey::try_from(vec![0xAB; 32]).expect("32-byte key should be valid");
    let debug = format!("{:?}", key);

    assert!(
        debug == "DatabaseKey([REDACTED])",
        "debug output should be redacted"
    );
}

#[test]
fn database_key_rejects_invalid_length() {
    let err = DatabaseKey::try_from(vec![0xAB; 31]).expect_err("short key should be rejected");
    let message = err.to_string();

    assert!(
        message.contains("32"),
        "error should explain that the key must be 32 bytes"
    );
}

#[cfg(not(feature = "sqlcipher"))]
#[tokio::test]
async fn connect_with_encryption_without_sqlcipher_feature_fails_clearly() {
    let db_path = std::env::temp_dir().join(format!(
        "baresync-sqlcipher-guard-{}-sqlcipher-test.db",
        std::process::id()
    ));

    let error = match DbClient::connect_with_encryption(&db_path, std::sync::Arc::new(TestKeyProvider))
        .await
    {
        Ok(_) => panic!("encrypted setup should fail without the sqlcipher feature"),
        Err(error) => error,
    };

    let message = error.to_string();
    assert!(
        message.contains("sqlcipher"),
        "error should explain that the sqlcipher feature is required"
    );
}

#[cfg(feature = "sqlcipher")]
#[tokio::test]
async fn encrypted_database_round_trip_preserves_data_and_migrations() {
    let db_path = temp_db_path("encrypted-round-trip");
    let provider = Arc::new(FixedKeyProvider {
        key: DatabaseKey::from([0x11; 32]),
    });
    let migrations = vec![EmbeddedMigration {
        name: "0001_notes",
        sql: "CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)",
    }];

    let db = DbClient::connect_with_encryption(&db_path, provider.clone())
        .await
        .expect("encrypted database should open");
    migrations::run_migrations(&db, &MigrationConfig::strict(), &migrations)
        .await
        .expect("migration should apply");
    db.execute(
        "INSERT INTO notes (body) VALUES (?1)",
        vec![serde_json::Value::String("hello".to_string())],
    )
    .await
    .expect("insert should work");

    drop(db);

    let reopened = DbClient::connect_with_encryption(&db_path, provider)
        .await
        .expect("encrypted database should reopen");
    let rows = reopened
        .query("SELECT body FROM notes ORDER BY id", vec![])
        .await
        .expect("row should be readable");
    assert_eq!(rows[0].values[0].as_str(), Some("hello"));

    let status = migrations::get_migration_status(&reopened)
        .await
        .expect("migration status should be readable");
    assert_eq!(status.len(), 1);
    assert_eq!(status[0].hash, "0001_notes");
}

#[cfg(feature = "sqlcipher")]
#[tokio::test]
async fn wrong_key_fails_to_reopen_encrypted_database() {
    let db_path = temp_db_path("wrong-key");
    let first_provider = Arc::new(FixedKeyProvider {
        key: DatabaseKey::from([0x22; 32]),
    });
    let wrong_provider = Arc::new(FixedKeyProvider {
        key: DatabaseKey::from([0x33; 32]),
    });

    let _db = DbClient::connect_with_encryption(&db_path, first_provider)
        .await
        .expect("encrypted database should open");

    let error = match DbClient::connect_with_encryption(&db_path, wrong_provider).await {
        Ok(_) => panic!("wrong key should fail"),
        Err(error) => error,
    };

    let message = error.to_string();
    assert!(
        message.contains("encrypted database") || message.contains("SQLCipher"),
        "error should describe the encrypted open failure"
    );
}

#[cfg(feature = "sqlcipher")]
#[tokio::test]
async fn plaintext_database_rejects_encryption() {
    let db_path = temp_db_path("plaintext-conflict");
    let plaintext_db = DbClient::connect(&db_path)
        .await
        .expect("plaintext database should open");
    plaintext_db
        .execute("CREATE TABLE plain_probe (id INTEGER PRIMARY KEY)", vec![])
        .await
        .expect("plaintext table should be created");
    drop(plaintext_db);

    let provider = Arc::new(FixedKeyProvider {
        key: DatabaseKey::from([0x44; 32]),
    });

    let error = match DbClient::connect_with_encryption(&db_path, provider).await {
        Ok(_) => panic!("plaintext database should not reopen as encrypted"),
        Err(error) => error,
    };

    let message = error.to_string();
    assert!(
        message.contains("plaintext") || message.contains("move, delete, or migrate"),
        "error should explain how to handle an existing plaintext database"
    );
}

#[cfg(feature = "sqlcipher")]
fn temp_db_path(prefix: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!(
        "baresync-{}-{}-{}.db",
        prefix,
        std::process::id(),
        nanos
    ))
}
