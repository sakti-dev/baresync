use std::{env, fmt::Write as _, fs, path::PathBuf};

fn main() {
    generate_migration_manifest();
    tauri_build::build()
}

fn generate_migration_manifest() {
    let manifest_dir =
        PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR not set"));
    let migration_dir = manifest_dir.join("migrations");
    println!("cargo:rerun-if-changed={}", migration_dir.display());

    let migrations = baresync_core::migrations::collect_migration_files(&migration_dir)
        .expect("failed to discover inventory migrations");

    for migration in &migrations {
        println!("cargo:rerun-if-changed={}", migration.path.display());
    }

    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR not set"));
    let generated = out_dir.join("inventory_migrations.rs");

    let mut source = String::new();
    source.push_str(
        "pub fn inventory_migrations() -> Vec<baresync_core::migrations::EmbeddedMigration> {\n",
    );
    source.push_str("    vec![\n");

    for migration in migrations {
        writeln!(
            source,
            "        baresync_core::migrations::EmbeddedMigration {{ name: {:?}, sql: include_str!(concat!(env!(\"CARGO_MANIFEST_DIR\"), \"/migrations/\", {:?})) }},",
            migration.name,
            migration.file_name
        )
        .expect("failed to write migration manifest");
    }

    source.push_str("    ]\n");
    source.push_str("}\n");

    fs::write(&generated, source).expect("failed to write generated migration manifest");
}
