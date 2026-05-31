use tauri_plugin_baresync::builder::Builder as BaresyncBuilder;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            BaresyncBuilder::new()
                .api_base_url("http://127.0.0.1:3001")
                .encoding("json")
                .db_name("baresync.db")
                .contract_json(include_str!(
                    "../../../../packages/sync-contract/generated/sync-contract.json"
                ))
                .migrations_path("migrations")
                .poll_interval_secs(30)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("failed to run app");
}
