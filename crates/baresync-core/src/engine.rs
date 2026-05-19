use sqlx::SqlitePool;

use crate::config::SyncEngineConfig;
use crate::error::SyncError;
use crate::gc;
use crate::pull::{self, PullResult};
use crate::push::{self, PushResult};

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
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

#[derive(Debug, serde::Serialize)]
pub struct SyncNowResult {
    pub pull: PullResult,
    pub push: PushResult,
    pub purged: usize,
}

impl SyncEngine {
    pub async fn new(
        pool: SqlitePool,
        mut config: SyncEngineConfig,
        tables: SyncContractTables,
    ) -> Self {
        config.client_id = crate::db::get_or_create_client_id(&pool)
            .await
            .unwrap_or_default();
        Self {
            pool,
            config,
            tables,
        }
    }

    pub async fn push(&self) -> Result<PushResult, SyncError> {
        let local_only: Vec<&str> = self
            .tables
            .local_only_columns
            .iter()
            .map(|s| s.as_str())
            .collect();
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
            pull::PullStartCursor::Stored,
            None,
        )
        .await
    }

    pub async fn sync_now(&self, limit: i32) -> Result<SyncNowResult, SyncError> {
        let pull_result = pull::pull(
            &self.pool,
            &self.config,
            &self.tables.upsert_order,
            &self.tables.delete_order,
            &self.tables.local_only_columns,
            limit,
            pull::PullStartCursor::Stored,
            None,
        )
        .await?;

        let push_result = self.push().await?;

        let pull_result = if !push_result.rejected_tables.is_empty() {
            let rejected_filter: Vec<String> = push_result.rejected_tables.clone();
            pull::pull(
                &self.pool,
                &self.config,
                &self.tables.upsert_order,
                &self.tables.delete_order,
                &self.tables.local_only_columns,
                limit,
                pull::PullStartCursor::Baseline,
                Some(&rejected_filter),
            )
            .await?
        } else {
            pull_result
        };

        let purged = gc::run_garbage_collection(
            &self.pool,
            &self.tables.upsert_order,
            &self.config.scope_id,
        )
        .await?;

        Ok(SyncNowResult {
            pull: pull_result,
            push: push_result,
            purged,
        })
    }

    pub async fn sync_full_resync(&self, limit: i32) -> Result<SyncNowResult, SyncError> {
        let pull_result = pull::pull(
            &self.pool,
            &self.config,
            &self.tables.upsert_order,
            &self.tables.delete_order,
            &self.tables.local_only_columns,
            limit,
            pull::PullStartCursor::Baseline,
            None,
        )
        .await?;

        let push_result = self.push().await?;

        let purged = gc::run_garbage_collection(
            &self.pool,
            &self.tables.upsert_order,
            &self.config.scope_id,
        )
        .await?;

        Ok(SyncNowResult {
            pull: pull_result,
            push: push_result,
            purged,
        })
    }

    pub async fn get_sync_local_state(&self) -> Result<crate::state::LocalSyncState, SyncError> {
        crate::state::get_sync_local_state(&self.pool, &self.config.scope_id).await
    }

    pub async fn purge_synced_outbox(&self, older_than: &str) -> Result<u64, SyncError> {
        crate::outbox::purge_synced_outbox(&self.pool, older_than).await
    }

    pub async fn run_garbage_collection(&self) -> Result<usize, SyncError> {
        gc::run_garbage_collection(&self.pool, &self.tables.upsert_order, &self.config.scope_id)
            .await
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }
}
