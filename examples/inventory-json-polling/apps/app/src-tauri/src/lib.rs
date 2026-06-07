use std::env;

use serde::Serialize;
use tauri::{command, generate_context, generate_handler, State};
use tauri_plugin_baresync::builder::Builder as BaresyncBuilder;
use tauri_plugin_baresync::commands::{run_sql_batch_with_state, PluginState};

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
async fn get_inventory_runtime_config() -> Result<InventoryRuntimeConfig, String> {
    let config = InventoryRuntimeConfig {
        api_url: fixture_api_url(),
        auth_token: inventory_auth_token(),
    };
    eprintln!(
        "[inventory-app] get_inventory_runtime_config api_url={} auth_token={}",
        config.api_url,
        if config.auth_token.is_some() {
            "set"
        } else {
            "unset"
        }
    );
    Ok(config)
}

#[derive(Serialize)]
struct InventoryRuntimeConfig {
    api_url: String,
    auth_token: Option<String>,
}

fn fixture_api_url() -> String {
    env::var("INVENTORY_API_URL").unwrap_or_else(|_| "http://127.0.0.1:3001".to_string())
}

fn inventory_auth_token() -> Option<String> {
    Some(
        env::var("INVENTORY_SYNC_TOKEN")
            .unwrap_or_else(|_| "demo-token".to_string())
            .trim()
            .to_string(),
    )
    .filter(|token| !token.is_empty())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .init();
    tauri::Builder::default()
        .plugin(
            BaresyncBuilder::new()
                .api_base_url("http://127.0.0.1:3001/api/sync/v1")
                .db_path("baresync.db")
                .contract_json(include_str!(
                    "../../../../packages/sync-contract/generated/2026-06-01/sync-contract.json"
                ))
                .migrations_path("migrations")
                .poll_interval_secs(30)
                .build(),
        )
        .invoke_handler(generate_handler![
            reset_fixture_state,
            get_inventory_runtime_config
        ])
        .run(generate_context!())
        .expect("failed to run inventory app");
}
