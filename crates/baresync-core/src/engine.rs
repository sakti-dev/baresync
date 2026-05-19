use sqlx::SqlitePool;

use crate::config::SyncEngineConfig;
use crate::error::SyncError;
use crate::pull::{self, PullResult};
use crate::push::{self, PushResult};

pub struct SyncContractTables {
    pub upsert_order: Vec<String>,
    pub delete_order: Vec<String>,
    pub local_only_columns: Vec<String>,
}

pub struct SyncEngine {
    pool: SqlitePool,
    config: SyncEngineConfig,
    tables: SyncContractTables,
}

impl SyncEngine {
    pub fn new(pool: SqlitePool, config: SyncEngineConfig, tables: SyncContractTables) -> Self {
        Self {
            pool,
            config,
            tables,
        }
    }

    pub async fn push(&self) -> Result<PushResult, SyncError> {
        let local_only: Vec<&str> = self.tables.local_only_columns.iter().map(|s| s.as_str()).collect();
        push::push(
            &self.pool,
            &self.config,
            &self.tables.upsert_order,
            &local_only,
        )
        .await
    }

    pub async fn pull(&self, limit: i32) -> Result<PullResult, SyncError> {
        pull::pull(
            &self.pool,
            &self.config,
            &self.tables.upsert_order,
            &self.tables.delete_order,
            &self.tables.local_only_columns,
            limit,
        )
        .await
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }
}
