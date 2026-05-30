## Why

The current `migrations_dir` builder API is easy to misunderstand because a relative path depends on the process working directory and is not clearly production-safe for packaged Tauri apps. Users should be able to point Baresync at Drizzle-generated `.sql` migrations with an API that makes the production packaging contract explicit.

## What Changes

- **BREAKING**: Remove the `Builder::migrations_dir(...)` API from `tauri-plugin-baresync`.
- Add a replacement directory path API for scanning `.sql` migration files during plugin setup and explicit migration commands.
- Resolve relative migration paths through Tauri's app resource directory so bundled migration folders work in production.
- Keep `Builder::migrations(...)` for manual embedded migrations.
- Require a clear behavior when both embedded migrations and a directory path are configured.
- Update docs and examples to present directory path migrations as the simple production-ready setup and embedded migrations as the manual advanced setup.

## Capabilities

### New Capabilities

### Modified Capabilities

- `tauri-plugin-builder`: Replace the `migrations_dir` builder requirement with a clearer migration path API that supports production Tauri resources.

## Impact

- Affects `crates/tauri-plugin-baresync` builder configuration and plugin setup path resolution.
- Affects host tests for plugin migration setup and command reruns.
- Affects documentation under Tauri plugin setup, migration guidance, production migration guidance, and Rust API reference.
- Affects the `examples/inventory-json-polling` Tauri app setup.
- Existing users of `.migrations_dir(...)` must migrate to the replacement API.
