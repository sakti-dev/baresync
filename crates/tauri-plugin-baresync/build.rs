const COMMANDS: &[&str] = &[
    "run_sql",
    "run_sql_batch",
    "get_db_info",
    "run_migrations",
    "get_migration_status",
    "sync_now",
    "sync_push",
    "sync_pull",
    "sync_full_resync",
    "get_sync_local_state",
    "purge_synced_outbox",
    "run_garbage_collection",
    "start_polling",
    "stop_polling",
    "pause_polling",
    "resume_polling",
    "get_polling_status",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
