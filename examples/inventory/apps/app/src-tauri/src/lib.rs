use std::env;
use std::path::PathBuf;

use tauri::{generate_context, generate_handler};
use tauri_plugin_baresync::builder::Builder as BaresyncBuilder;
use tauri_plugin_baresync::commands::{
    get_db_info, get_migration_status, get_sync_local_state, purge_synced_outbox,
    run_garbage_collection, run_migrations, run_sql, run_sql_batch, sync_full_resync, sync_now,
    sync_pull, sync_push,
};

fn inventory_db_path() -> String {
    let base = env::var("INVENTORY_DB_PATH").unwrap_or_else(|_| {
        let mut path = std::env::temp_dir();
        path.push("baresync-inventory.db");
        path.to_string_lossy().to_string()
    });

    PathBuf::from(base).to_string_lossy().to_string()
}

fn inventory_contract_tables() -> baresync_core::engine::SyncContractTables {
    baresync_core::engine::SyncContractTables {
        upsert_order: vec![
            "locations".to_string(),
            "items".to_string(),
            "stock_counts".to_string(),
        ],
        delete_order: vec![
            "stock_counts".to_string(),
            "items".to_string(),
            "locations".to_string(),
        ],
        local_only_columns: vec!["is_synced".to_string()],
    }
}

fn inventory_migrations() -> Vec<baresync_core::migrations::EmbeddedMigration> {
    vec![baresync_core::migrations::EmbeddedMigration {
        name: "0001_init_inventory_schema",
        sql: include_str!("../migrations/0001_init_inventory_schema.sql"),
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            BaresyncBuilder::new()
                .api_base_url("http://127.0.0.1:18181")
                .encoding("json")
                .db_path(inventory_db_path())
                .contract_tables(inventory_contract_tables())
                .migrations(inventory_migrations())
                .build(),
        )
        .invoke_handler(generate_handler![
            run_sql,
            run_sql_batch,
            get_db_info,
            run_migrations,
            get_migration_status,
            sync_now,
            sync_push,
            sync_pull,
            sync_full_resync,
            get_sync_local_state,
            purge_synced_outbox,
            run_garbage_collection,
        ])
        .run(generate_context!())
        .expect("failed to run inventory app");
}
