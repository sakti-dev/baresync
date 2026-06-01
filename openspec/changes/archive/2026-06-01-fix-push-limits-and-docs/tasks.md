## 1. Builder API changes

- [x] 1.1 Remove `.max_push_bytes()` method from `Builder` in `crates/tauri-plugin-baresync/src/builder.rs`
- [x] 1.2 Remove `.max_push_rows()` method from `Builder` in `crates/tauri-plugin-baresync/src/builder.rs`
- [x] 1.3 In `build()`, use core engine defaults instead of builder overrides for `max_push_bytes` and `max_push_rows` — remove the `let max_push_bytes = self.max_push_bytes.unwrap_or(256 * 1024)` and `let max_push_rows = self.max_push_rows.unwrap_or(2000)` lines, and let `SyncEngineConfig::default()` apply them
- [x] 1.4 Remove `max_push_bytes` and `max_push_rows` fields from the `Builder` struct
- [x] 1.5 Update `PluginConfig` to use `SyncEngineConfig::default()` values for `max_push_bytes` (2MB) and `max_push_rows` (2000) in its `Default` impl
- [x] 1.6 Remove `.transport()` method from `Builder` and `transport` field from `Builder` struct
- [x] 1.7 Remove `.db_name()` method from `Builder` and `db_name` field from `Builder` struct
- [x] 1.8 Update `build()` to remove `transport` and `db_name` resolution — use default transport and `db_path` only
- [x] 1.9 Remove `db_name` from `PluginConfig` struct
- [x] 1.10 Update `test_config` in builder.rs tests to remove `transport` field

## 2. Test fixes

- [x] 2.1 Update `test_config` in `builder.rs` tests to not reference removed builder methods
- [x] 2.2 Run `cargo test -p tauri-plugin-baresync` and fix any compilation or test failures
- [x] 2.3 Update tests to remove transport mocking (use core engine directly if needed)
- [x] 2.4 Run `cargo test -p tauri-plugin-baresync` after transport/db_name removal

## 3. Doc fixes — errors.mdx

- [x] 3.1 In `apps/docs/content/docs/reference/errors.mdx`, change `Encoding(String)` to `JsonParse(String)` in the enum listing
- [x] 3.2 In the error table, change `Encoding(msg)` description to `JsonParse(msg)` and update the description text

## 4. Doc fixes — configuration.mdx

- [x] 4.1 Remove `max_push_bytes` and `max_push_rows` rows from the "All options" table in `apps/docs/content/docs/running-in-production/configuration.mdx`
- [x] 4.2 Remove `transport` and `db_name` rows from the "All options" table
- [x] 4.3 Fix `migrations_path` default from `""` to `None`
- [x] 4.4 Add `contract_json` and `encryption_key_provider` to the options table
- [x] 4.5 Add `synchronous = NORMAL` and `busy_timeout = 5s` to the SQLite connection settings section

## 5. Doc fixes — performance.mdx

- [x] 5.1 Rewrite "How push chunking works" section in `apps/docs/content/docs/running-in-production/performance.mdx` to accurately describe two-level chunking (target_push_bytes 256KB vs max_push_bytes 2MB)
- [x] 5.2 Update "Tuning chunk size" section — remove references to client-side `max_push_bytes` configuration, explain that the defaults are safe for all platforms
- [x] 5.3 Update "Recommended server limits" table to clarify server owns the constraints, client adapts via 413

## 6. Spec update

- [x] 6.1 Archive the `tauri-plugin-builder` delta spec from this change into the main spec
