use std::env;
#[cfg(feature = "sqlcipher")]
use std::error::Error;
#[cfg(target_os = "android")]
use std::fs;
use std::sync::Arc;

use serde::Serialize;
use tauri::{command, generate_context, State};
use tauri_plugin_baresync::builder::Builder as BaresyncBuilder;
#[cfg(feature = "sqlcipher")]
use tauri_plugin_baresync::{DatabaseKey, EncryptionKeyContext, EncryptionKeyProvider};
use tauri_plugin_baresync::commands::{run_sql_batch_with_state, PluginState};

#[derive(Serialize)]
struct FixtureRuntimeConfig {
    api_url: String,
}

fn fixture_db_path() -> String {
    let run_id = env::var("BARESYNC_FIXTURE_RUN_ID").unwrap_or_else(|_| "local".to_string());

    #[cfg(target_os = "android")]
    {
        let db_dir = "/data/user/0/com.baresync.fixture/files";
        if let Err(error) = fs::create_dir_all(db_dir) {
            eprintln!("failed to create Android fixture DB directory {db_dir}: {error}");
        }

        format!("{db_dir}/baresync-fixture-{run_id}.db")
    }

    #[cfg(not(target_os = "android"))]
    {
        format!("/tmp/baresync-fixture-{run_id}.db")
    }
}

fn fixture_api_url() -> String {
    if let Ok(url) = env::var("BARESYNC_FIXTURE_API_URL") {
        return url;
    }

    option_env!("BARESYNC_FIXTURE_API_URL")
        .map(std::string::ToString::to_string)
        .unwrap_or_else(|| {
            #[cfg(target_os = "android")]
            {
                "http://10.0.2.2:3001".to_string()
            }

            #[cfg(not(target_os = "android"))]
            {
                "http://127.0.0.1:3001".to_string()
            }
        })
}

fn fixture_contract_tables() -> baresync_core::engine::SyncContractTables {
    baresync_core::engine::SyncContractTables {
        upsert_order: vec!["categories".to_string(), "products".to_string()],
        delete_order: vec!["products".to_string(), "categories".to_string()],
        local_only_columns: vec!["is_synced".to_string()],
    }
}

fn fixture_migrations() -> Vec<baresync_core::migrations::EmbeddedMigration> {
    vec![baresync_core::migrations::EmbeddedMigration {
        name: "0001_init_fixture_schema",
        sql: include_str!("../migrations/0001_init_fixture_schema.sql"),
    }]
}

#[cfg(feature = "sqlcipher")]
#[derive(Clone, Default)]
struct FixtureEncryptionKeyProvider;

#[cfg(feature = "sqlcipher")]
impl EncryptionKeyProvider for FixtureEncryptionKeyProvider {
    fn encryption_key(
        &self,
        _context: EncryptionKeyContext,
    ) -> Result<DatabaseKey, Box<dyn Error + Send + Sync>> {
        Ok(DatabaseKey::from([0x42; 32]))
    }
}

#[command]
async fn reset_fixture_state(state: State<'_, PluginState>) -> Result<(), String> {
    run_sql_batch_with_state(
        &state,
        vec![
            baresync_core::drizzle_proxy::SqlStatement {
                sql: "DELETE FROM products".to_string(),
                params: vec![],
            },
            baresync_core::drizzle_proxy::SqlStatement {
                sql: "DELETE FROM categories".to_string(),
                params: vec![],
            },
            baresync_core::drizzle_proxy::SqlStatement {
                sql: "DELETE FROM sync_outbox".to_string(),
                params: vec![],
            },
            baresync_core::drizzle_proxy::SqlStatement {
                sql: "DELETE FROM sync_cursors".to_string(),
                params: vec![],
            },
        ],
    )
    .await
    .map(|_| ())
}

#[command]
async fn get_fixture_runtime_config() -> Result<FixtureRuntimeConfig, String> {
    let config = FixtureRuntimeConfig {
        api_url: fixture_api_url(),
    };
    eprintln!(
        "[fixture-app] get_fixture_runtime_config api_url={}",
        config.api_url
    );
    Ok(config)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let plugin_builder = BaresyncBuilder::new()
        .api_base_url(fixture_api_url())
        .db_path(fixture_db_path())
        .contract_tables(fixture_contract_tables())
        .migrations(fixture_migrations())
        .transport(baresync_core::http::default_transport());

    #[cfg(feature = "sqlcipher")]
    let plugin_builder = plugin_builder.encryption_key_provider(FixtureEncryptionKeyProvider);

    tauri::Builder::default()
        .plugin(plugin_builder.build())
        .invoke_handler(tauri::generate_handler![reset_fixture_state, get_fixture_runtime_config])
        .run(generate_context!())
        .expect("failed to run fixture app");
}
