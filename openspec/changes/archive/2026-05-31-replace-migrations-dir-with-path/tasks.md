## 1. Plugin API

- [x] 1.1 Replace `Builder::migrations_dir(...)` with `Builder::migrations_path(...)` in `crates/tauri-plugin-baresync`.
- [x] 1.2 Resolve relative migration paths through Tauri's resource resolver during plugin setup.
- [x] 1.3 Preserve absolute migration paths as direct filesystem paths.
- [x] 1.4 Store the resolved migration path in `PluginState` so `run_migrations` uses the same path as startup.
- [x] 1.5 Fail setup with an actionable error when both embedded migrations and `migrations_path` are configured.

## 2. Tests

- [x] 2.1 Add or update host tests for setup/config behavior around `migrations_path`.
- [x] 2.2 Add or update command tests proving explicit `run_migrations` uses the resolved migration path.
- [x] 2.3 Add a failure-path test for configuring both embedded migrations and `migrations_path`.

## 3. Example App

- [x] 3.1 Update `examples/inventory-json-polling/apps/app/src-tauri/src/lib.rs` to use `.migrations_path("migrations")`.
- [x] 3.2 Remove the example app's generated migration manifest flow from `build.rs`.
- [x] 3.3 Remove `baresync-core` from the example app's `[build-dependencies]` if it is no longer needed there.
- [x] 3.4 Add the migration SQL files to the example app's Tauri bundle resources.

## 4. Documentation

- [x] 4.1 Update getting-started plugin registration docs to show `migrations_path`.
- [x] 4.2 Update Tauri plugin migration and builder docs to make path-based migrations the simple production-ready setup.
- [x] 4.3 Update production migration guidance and Rust API reference to remove `migrations_dir` and document `migrations_path`.
- [x] 4.4 Keep manual embedded migration docs as the advanced option.

## 5. Verification

- [x] 5.1 Run relevant Rust tests for `baresync-core` and `tauri-plugin-baresync`.
- [x] 5.2 Run `cargo check` for the example Tauri app.
- [x] 5.3 Run `bun x ultracite check`.
- [x] 5.4 Run the repo typecheck script.
