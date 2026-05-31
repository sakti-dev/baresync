## Context

`tauri-plugin-baresync` already owns the actual command implementations, but consumer apps must re-export each one through app-local `#[command]` wrappers and register them with `tauri::generate_handler!`. Consumer apps must also duplicate generated sync table order as Rust `SyncContractTables`. This is tedious for handwritten integrations and creates an unnecessary maintenance burden for a future `create-baresync` scaffolder.

The setup should remain explicit in Rust builder code. We are intentionally not moving defaults into `tauri.conf.json`, because Baresync setup is coupled to code-level choices such as generated artifact paths, test transports, DB path policy, and optional encryption providers.

## Goals / Non-Goals

**Goals:**

- Let consumer apps register Baresync with a compact `.plugin(BaresyncBuilder::new()...build())` call.
- Move Tauri command registration into the plugin so apps do not write local command wrappers.
- Let the builder consume generated contract metadata for table order and local-only columns.
- Provide an app-data DB helper for normal apps while keeping explicit DB paths for tests.
- Update JS helpers to call plugin-registered command names by default while preserving custom invoke/command overrides.

**Non-Goals:**

- Do not read Baresync config from `tauri.conf.json`.
- Do not generate SQL migrations in this change.
- Do not build the `create-baresync` scaffolder in this change.
- Do not remove host-testable command logic or direct command functions used by existing tests.

## Decisions

### Plugin-Owned Command Registration

`Builder::build()` will register Baresync commands through the Tauri plugin builder instead of requiring app-level `invoke_handler(generate_handler![...])`. Command functions remain in `commands.rs`, but the plugin exposes them under the `plugin:baresync|...` command namespace.

Alternative considered: generate a Rust `baresync.rs` module for every app that contains wrappers and an invoke handler macro. This reduces user typing but still duplicates glue in consumer apps and makes scaffolding responsible for keeping Rust command lists current.

### Generated Contract Metadata Loading

Add a builder method that accepts generated contract metadata as a string, for example `contract_manifest_json(...)` or `contract_json(...)`, and converts it into `SyncContractTables`. The implementation should prefer the smallest generated artifact that already contains `upsert_order`, `delete_order`, and `local_only_columns`. If the manifest lacks enough information, use the generated sync contract JSON.

Keep `.contract_tables(...)` for tests, advanced consumers, and compatibility.

Alternative considered: continue documenting app-authored `SyncContractTables`. That keeps the builder simple but preserves the drift risk this change is meant to remove.

### App-Data DB Name Helper

Add `.db_name("todo.db")` for the common path. During setup, the plugin resolves this name under Tauri's app data directory and creates parent directories as needed. Existing `.db_path(...)` remains available and takes precedence when explicitly configured.

Alternative considered: make `.db_path(...)` smarter for relative paths. That would change existing behavior and could surprise tests or consumers that expect current path semantics.

### JS Default Command Namespace

`createSyncClient` and `createTauriDrizzleDatabase` will default to plugin command names. Existing injected `invoke` behavior remains unchanged, and command-name overrides remain supported so legacy app-level command registration can continue during migration.

Alternative considered: preserve unprefixed defaults forever. That would force every new app to keep app-local command wrappers, which prevents the simplified setup from becoming the default.

## Risks / Trade-offs

- [Breaking default command names for apps that still use local wrappers] -> Mitigation: keep command override options and document the migration path.
- [Tauri plugin command registration API shape may constrain implementation] -> Mitigation: spike command registration in a focused plugin test before migrating fixture app.
- [Generated manifest may not contain all table metadata needed by Rust] -> Mitigation: either extend the manifest or accept full contract JSON; validate missing table metadata with a clear builder error.
- [App-data path behavior differs across desktop/mobile platforms] -> Mitigation: test path resolution through Tauri path APIs where possible and keep `.db_path(...)` for deterministic fixture/test paths.
- [Docs and examples can drift during transition] -> Mitigation: migrate the fixture app first, then update docs to match the fixture pattern.

## Migration Plan

1. Add plugin-owned command registration while preserving command functions for host tests.
2. Add builder metadata parsing and `.db_name(...)`.
3. Switch JS default command names to plugin namespace with compatibility overrides.
4. Migrate fixture app to compact plugin registration.
5. Update docs to show the compact builder setup and legacy command override path.

Rollback is to keep direct command functions and JS command overrides. If plugin-owned command registration is incomplete on a platform, consumers can temporarily register app-local wrappers and configure JS helpers to use unprefixed command names.

## Open Questions

- Should the builder consume `sync-contract.manifest.json`, `sync-contract.json`, or support both?
- What exact method name should be public: `contract_manifest_json`, `contract_json`, or `contract_tables_from_json`?
