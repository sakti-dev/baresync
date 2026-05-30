use crate::config::SyncEngineConfig;
use crate::db::DbClient;
use crate::error::SyncError;
use crate::gc;
use crate::pull::{self, PullResult};
use crate::push::{self, PushResult};
use crate::status::{self, SyncStatusResult};

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct SyncContractTables {
    pub upsert_order: Vec<String>,
    pub delete_order: Vec<String>,
    pub local_only_columns: Vec<String>,
}

#[derive(Clone, Copy, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SyncNowMode {
    NoOp,
    PushOnly,
    PullOnly,
    FullSync,
    FullResync,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct SyncNoOpResult {
    pub local_dirty_count: i64,
    pub server_has_changes: bool,
}

pub struct SyncEngine {
    db: DbClient,
    config: SyncEngineConfig,
    tables: SyncContractTables,
}

#[derive(Debug, serde::Serialize)]
pub struct SyncNowResult {
    pub mode: SyncNowMode,
    pub status: Option<SyncStatusResult>,
    pub pull: Option<PullResult>,
    pub push: Option<PushResult>,
    pub purged: usize,
    pub skipped: Option<SyncNoOpResult>,
}

impl SyncEngine {
    pub async fn new(
        db: DbClient,
        mut config: SyncEngineConfig,
        tables: SyncContractTables,
    ) -> Self {
        config.client_id = crate::db::get_or_create_client_id(&db)
            .await
            .unwrap_or_default();
        Self { db, config, tables }
    }

    pub async fn push(&self) -> Result<PushResult, SyncError> {
        let local_only: Vec<&str> = self
            .tables
            .local_only_columns
            .iter()
            .map(|s| s.as_str())
            .collect();
        push::push(
            &self.db,
            &self.config,
            &self.tables.upsert_order,
            &local_only,
        )
        .await
    }

    pub async fn pull(&self, limit: i32) -> Result<PullResult, SyncError> {
        pull::pull(
            &self.db,
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
        let local_state = self.get_sync_local_state().await?;
        let status_result = status::status(&self.db, &self.config).await?;
        let changed_tables = self.resolve_changed_tables(&status_result);
        let local_dirty_count = local_state.local_dirty_count;

        if local_state.needs_baseline_sync {
            return self
                .run_full_resync(limit, Some(&changed_tables), Some(status_result))
                .await;
        }

        if local_dirty_count == 0 && !status_result.has_changes {
            return Ok(SyncNowResult {
                mode: SyncNowMode::NoOp,
                status: Some(status_result),
                pull: None,
                push: None,
                purged: 0,
                skipped: Some(SyncNoOpResult {
                    local_dirty_count,
                    server_has_changes: false,
                }),
            });
        }

        if local_dirty_count > 0 && !status_result.has_changes {
            return self.run_push_only(limit, Some(status_result)).await;
        }

        if local_dirty_count == 0 && status_result.has_changes {
            return self
                .run_pull_only(limit, Some(&changed_tables), Some(status_result))
                .await;
        }

        self.run_full_sync(limit, Some(&changed_tables), Some(status_result))
            .await
    }

    pub async fn sync_full_resync(&self, limit: i32) -> Result<SyncNowResult, SyncError> {
        self.run_full_resync(limit, None, None).await
    }

    async fn run_push_only(
        &self,
        limit: i32,
        status_result: Option<SyncStatusResult>,
    ) -> Result<SyncNowResult, SyncError> {
        let push_result = self.push().await?;
        let pull_result = if !push_result.rejected_tables.is_empty() {
            let rejected_filter: Vec<String> = push_result.rejected_tables.clone();
            Some(
                pull::pull(
                    &self.db,
                    &self.config,
                    &self.tables.upsert_order,
                    &self.tables.delete_order,
                    &self.tables.local_only_columns,
                    limit,
                    pull::PullStartCursor::Baseline,
                    Some(&rejected_filter),
                )
                .await?,
            )
        } else {
            None
        };

        let purged =
            gc::run_garbage_collection(&self.db, &self.tables.upsert_order, &self.config.scope_id)
                .await?;

        Ok(SyncNowResult {
            mode: SyncNowMode::PushOnly,
            status: status_result,
            pull: pull_result,
            push: Some(push_result),
            purged,
            skipped: None,
        })
    }

    async fn run_pull_only(
        &self,
        limit: i32,
        changed_tables: Option<&[String]>,
        status_result: Option<SyncStatusResult>,
    ) -> Result<SyncNowResult, SyncError> {
        let pull_result = pull::pull(
            &self.db,
            &self.config,
            &self.tables.upsert_order,
            &self.tables.delete_order,
            &self.tables.local_only_columns,
            limit,
            pull::PullStartCursor::Stored,
            changed_tables,
        )
        .await?;

        let purged =
            gc::run_garbage_collection(&self.db, &self.tables.upsert_order, &self.config.scope_id)
                .await?;

        Ok(SyncNowResult {
            mode: SyncNowMode::PullOnly,
            status: status_result,
            pull: Some(pull_result),
            push: None,
            purged,
            skipped: None,
        })
    }

    async fn run_full_sync(
        &self,
        limit: i32,
        changed_tables: Option<&[String]>,
        status_result: Option<SyncStatusResult>,
    ) -> Result<SyncNowResult, SyncError> {
        let pull_result = pull::pull(
            &self.db,
            &self.config,
            &self.tables.upsert_order,
            &self.tables.delete_order,
            &self.tables.local_only_columns,
            limit,
            pull::PullStartCursor::Stored,
            changed_tables,
        )
        .await?;

        let push_result = self.push().await?;
        let pull_result = if !push_result.rejected_tables.is_empty() {
            let rejected_filter: Vec<String> = push_result.rejected_tables.clone();
            Some(
                pull::pull(
                    &self.db,
                    &self.config,
                    &self.tables.upsert_order,
                    &self.tables.delete_order,
                    &self.tables.local_only_columns,
                    limit,
                    pull::PullStartCursor::Baseline,
                    Some(&rejected_filter),
                )
                .await?,
            )
        } else {
            Some(pull_result)
        };

        let purged =
            gc::run_garbage_collection(&self.db, &self.tables.upsert_order, &self.config.scope_id)
                .await?;

        Ok(SyncNowResult {
            mode: SyncNowMode::FullSync,
            status: status_result,
            pull: pull_result,
            push: Some(push_result),
            purged,
            skipped: None,
        })
    }

    async fn run_full_resync(
        &self,
        limit: i32,
        changed_tables: Option<&[String]>,
        status_result: Option<SyncStatusResult>,
    ) -> Result<SyncNowResult, SyncError> {
        let pull_result = pull::pull(
            &self.db,
            &self.config,
            &self.tables.upsert_order,
            &self.tables.delete_order,
            &self.tables.local_only_columns,
            limit,
            pull::PullStartCursor::Baseline,
            changed_tables,
        )
        .await?;

        let push_result = self.push().await?;

        let purged =
            gc::run_garbage_collection(&self.db, &self.tables.upsert_order, &self.config.scope_id)
                .await?;

        Ok(SyncNowResult {
            mode: SyncNowMode::FullResync,
            status: status_result,
            pull: Some(pull_result),
            push: Some(push_result),
            purged,
            skipped: None,
        })
    }

    fn resolve_changed_tables(&self, status_result: &SyncStatusResult) -> Vec<String> {
        if status_result.changed_tables.is_empty() {
            self.tables.upsert_order.clone()
        } else {
            status_result.changed_tables.clone()
        }
    }

    pub async fn get_sync_local_state(&self) -> Result<crate::state::LocalSyncState, SyncError> {
        crate::state::get_sync_local_state(&self.db, &self.config.scope_id).await
    }

    pub async fn purge_synced_outbox(&self, older_than: &str) -> Result<u64, SyncError> {
        crate::outbox::purge_synced_outbox(&self.db, older_than).await
    }

    pub async fn run_garbage_collection(&self) -> Result<usize, SyncError> {
        gc::run_garbage_collection(&self.db, &self.tables.upsert_order, &self.config.scope_id).await
    }
}
