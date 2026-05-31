use crate::db_worker::DbWorker;
use crate::error::SyncError;
use std::convert::TryFrom;
use std::error::Error;
use std::fmt;
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::fs;

#[derive(Clone)]
pub struct DbClient {
    worker: DbWorker,
}

impl DbClient {
    pub(crate) fn from_worker(worker: DbWorker) -> Self {
        Self { worker }
    }

    pub async fn connect(path: impl AsRef<Path>) -> Result<Self, SyncError> {
        Self::connect_with_provider(path, None).await
    }

    pub async fn connect_with_encryption(
        path: impl AsRef<Path>,
        provider: Arc<dyn EncryptionKeyProvider>,
    ) -> Result<Self, SyncError> {
        Self::connect_with_provider(path, Some(provider)).await
    }

    async fn connect_with_provider(
        path: impl AsRef<Path>,
        provider: Option<Arc<dyn EncryptionKeyProvider>>,
    ) -> Result<Self, SyncError> {
        let path = path.as_ref().to_path_buf();
        let encryption_key = if let Some(provider) = provider {
            if !cfg!(feature = "sqlcipher") {
                return Err(SyncError::Database(
                    "SQLCipher support is disabled. Rebuild Baresync with the `sqlcipher` feature to use an encryption key provider."
                        .to_string(),
                ));
            }

            Some(
                provider
                    .encryption_key(EncryptionKeyContext {
                        db_path: path.clone(),
                        database_exists: path.exists(),
                    })
                    .map_err(|e| {
                        SyncError::Database(format!(
                            "Failed to obtain database encryption key: {}",
                            e
                        ))
                    })?,
            )
        } else {
            None
        };

        let worker = if let Some(encryption_key) = encryption_key {
            DbWorker::connect_with_encryption(path, Some(encryption_key)).await?
        } else {
            DbWorker::connect(path).await?
        };
        let db = Self::from_worker(worker);
        ensure_sync_client_identity_table(&db).await?;
        Ok(db)
    }

    pub async fn execute(
        &self,
        sql: impl AsRef<str>,
        params: Vec<Value>,
    ) -> Result<DbExecutionResult, SyncError> {
        self.worker.execute(sql, params).await
    }

    pub async fn query(
        &self,
        sql: impl AsRef<str>,
        params: Vec<Value>,
    ) -> Result<Vec<DbRow>, SyncError> {
        self.worker.query(sql, params).await
    }

    pub(crate) async fn batch<S>(
        &self,
        statements: Vec<(S, Vec<Value>)>,
    ) -> Result<DbExecutionResult, SyncError>
    where
        S: AsRef<str>,
    {
        self.worker.batch(statements).await
    }

    pub(crate) async fn apply_migration(
        &self,
        name: impl AsRef<str>,
        sql: impl AsRef<str>,
        strict: bool,
        created_at: i64,
    ) -> Result<DbExecutionResult, SyncError> {
        self.worker
            .apply_migration(name, sql, strict, created_at)
            .await
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct DbRow {
    pub columns: Vec<String>,
    pub values: Vec<Value>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DbExecutionResult {
    pub last_insert_id: i64,
    pub rows_affected: u64,
}

#[derive(Clone, Debug)]
pub struct EncryptionKeyContext {
    pub db_path: PathBuf,
    pub database_exists: bool,
}

pub trait EncryptionKeyProvider: Send + Sync {
    fn encryption_key(
        &self,
        context: EncryptionKeyContext,
    ) -> Result<DatabaseKey, Box<dyn Error + Send + Sync>>;
}

#[derive(Clone, PartialEq, Eq)]
pub struct DatabaseKey([u8; 32]);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DatabaseKeyError {
    len: usize,
}

impl DatabaseKeyError {
    fn new(len: usize) -> Self {
        Self { len }
    }
}

impl fmt::Display for DatabaseKeyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "database key must contain exactly 32 bytes, got {}",
            self.len
        )
    }
}

impl Error for DatabaseKeyError {}

impl fmt::Debug for DatabaseKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("DatabaseKey([REDACTED])")
    }
}

impl From<[u8; 32]> for DatabaseKey {
    fn from(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }
}

impl TryFrom<Vec<u8>> for DatabaseKey {
    type Error = DatabaseKeyError;

    fn try_from(bytes: Vec<u8>) -> Result<Self, Self::Error> {
        Self::try_from(bytes.as_slice())
    }
}

impl TryFrom<&[u8]> for DatabaseKey {
    type Error = DatabaseKeyError;

    fn try_from(bytes: &[u8]) -> Result<Self, Self::Error> {
        if bytes.len() != 32 {
            return Err(DatabaseKeyError::new(bytes.len()));
        }

        let mut key = [0u8; 32];
        key.copy_from_slice(bytes);
        Ok(Self(key))
    }
}

impl DatabaseKey {
    #[cfg(feature = "sqlcipher")]
    pub(crate) fn as_hex_key(&self) -> String {
        let mut hex = String::with_capacity(64);
        for byte in &self.0 {
            use std::fmt::Write as _;
            let _ = write!(&mut hex, "{:02x}", byte);
        }
        hex
    }
}

pub struct LocalDatabase {
    db: DbClient,
}

impl LocalDatabase {
    pub fn db(&self) -> &DbClient {
        &self.db
    }

    pub async fn connect(path: impl AsRef<Path>) -> Result<Self, SyncError> {
        let db = connect_db(path).await?;

        Ok(Self { db })
    }

    pub async fn connect_with_encryption(
        path: impl AsRef<Path>,
        provider: Arc<dyn EncryptionKeyProvider>,
    ) -> Result<Self, SyncError> {
        let db = connect_db_with_encryption(path, provider).await?;

        Ok(Self { db })
    }
}

pub async fn connect_db(path: impl AsRef<Path>) -> Result<DbClient, SyncError> {
    DbClient::connect(path).await
}

pub async fn connect_db_with_encryption(
    path: impl AsRef<Path>,
    provider: Arc<dyn EncryptionKeyProvider>,
) -> Result<DbClient, SyncError> {
    DbClient::connect_with_encryption(path, provider).await
}

async fn ensure_sync_client_identity_table(db: &DbClient) -> Result<(), SyncError> {
    db.execute(
        "CREATE TABLE IF NOT EXISTS sync_client_identity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL
        )",
        vec![],
    )
    .await
    .map_err(|e| {
        SyncError::Database(format!(
            "Failed to create sync_client_identity table: {}",
            e
        ))
    })?;

    Ok(())
}

#[derive(Debug, Serialize)]
pub struct DbInfo {
    pub db_path: String,
    pub size_bytes: u64,
    pub size_formatted: String,
}

pub async fn get_db_info(path: impl AsRef<Path>) -> Result<DbInfo, SyncError> {
    let path = path.as_ref();
    let metadata = fs::metadata(path)
        .await
        .map_err(|e| SyncError::Database(format!("Failed to get DB file info: {}", e)))?;
    let size = metadata.len();
    Ok(DbInfo {
        db_path: path.display().to_string(),
        size_bytes: size,
        size_formatted: format_file_size(size),
    })
}

pub fn format_file_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = 1024 * KB;
    if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

pub async fn get_or_create_client_id(db: &DbClient) -> Result<String, SyncError> {
    let existing = db
        .query(
            "SELECT client_id FROM sync_client_identity ORDER BY id LIMIT 1",
            vec![],
        )
        .await
        .map_err(|e| SyncError::Database(format!("Failed to query client identity: {}", e)))?;

    if let Some(row) = existing.first() {
        if let Some(Value::String(client_id)) = row.values.first() {
            return Ok(client_id.clone());
        }
    }

    let client_id = uuid::Uuid::new_v4().to_string();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let created_at = format!("{}", now);

    db.execute(
        "INSERT INTO sync_client_identity (client_id, created_at) VALUES (?1, ?2)",
        vec![Value::String(client_id.clone()), Value::String(created_at)],
    )
    .await
    .map_err(|e| SyncError::Database(format!("Failed to insert client identity: {}", e)))?;

    Ok(client_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn connect_db_uses_single_worker() {
        assert_eq!(1, 1);
    }

    #[tokio::test]
    async fn connect_db_sets_wal_mode() {
        let dir = std::env::temp_dir().join(format!(
            "baresync-test-wal-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("test.db");
        let db = connect_db(db_path.to_str().unwrap()).await.unwrap();

        let mode = db.query("PRAGMA journal_mode", vec![]).await.unwrap();
        assert_eq!(mode[0].values[0].as_str().unwrap().to_lowercase(), "wal");

        let fk = db.query("PRAGMA foreign_keys", vec![]).await.unwrap();
        assert_eq!(fk[0].values[0].as_i64().unwrap(), 1);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn connect_db_creates_sync_client_identity_table() {
        let db = connect_db(":memory:").await.unwrap();

        let rows = db
            .query(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sync_client_identity'",
                vec![],
            )
            .await
            .unwrap();

        assert_eq!(
            rows.len(),
            1,
            "DbClient::connect should create the sync_client_identity table"
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn local_database_connect_preserves_non_utf8_paths() {
        use std::ffi::OsString;
        use std::os::unix::ffi::OsStringExt;

        let dir = std::env::temp_dir().join(format!(
            "baresync-test-non-utf8-path-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join(OsString::from_vec(b"baresync-\xFF.db".to_vec()));

        let _db = LocalDatabase::connect(&db_path).await.unwrap();

        assert!(
            db_path.exists(),
            "LocalDatabase::connect should open the exact Path it receives"
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn get_db_info_returns_file_metadata() {
        let dir = std::env::temp_dir().join(format!(
            "baresync-test-dbinfo-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("info_test.db");
        let db = connect_db(db_path.to_str().unwrap()).await.unwrap();
        db.execute("CREATE TABLE t (id INTEGER)", vec![])
            .await
            .unwrap();

        let info = get_db_info(&db_path).await.unwrap();
        assert!(info.size_bytes > 0);
        assert!(info.size_formatted.contains("B"));
        assert!(info.db_path.contains("info_test.db"));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn get_or_create_client_id_generates_and_reuses() {
        let db = connect_db(":memory:").await.unwrap();

        db.execute(
            "CREATE TABLE IF NOT EXISTS sync_client_identity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL
            )",
            vec![],
        )
        .await
        .unwrap();

        let first = get_or_create_client_id(&db).await.unwrap();
        let second = get_or_create_client_id(&db).await.unwrap();
        assert_eq!(first, second);
        assert!(!first.is_empty());
    }
}
