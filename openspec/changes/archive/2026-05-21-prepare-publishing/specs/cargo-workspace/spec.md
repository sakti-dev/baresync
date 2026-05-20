## MODIFIED Requirements

### Requirement: tauri-plugin-baresync crate compiles with tauri dependency

The `crates/tauri-plugin-baresync` crate SHALL:

- Use edition 2021
- Depend on `tauri` 2 and `baresync-core`
- Declare the `baresync-core` dependency with both a local `path` for workspace development and a `version` requirement suitable for Cargo package verification
- Expose a public `lib.rs` that compiles without errors

#### Scenario: Plugin crate compiles independently

- **WHEN** `cargo test -p tauri-plugin-baresync` is run
- **THEN** the crate compiles without errors and zero tests pass

#### Scenario: Plugin crate packages with registry-compatible dependency metadata

- **WHEN** `cargo package -p tauri-plugin-baresync --allow-dirty` is run
- **THEN** Cargo package verification succeeds without reporting a missing version requirement for `baresync-core`
