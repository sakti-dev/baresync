## ADDED Requirements

### Requirement: Root Cargo workspace with two crate members

A root `Cargo.toml` SHALL define a `[workspace]` with `members` including
`crates/baresync-core` and `crates/tauri-plugin-baresync`.

#### Scenario: Workspace resolves both crates

- **WHEN** `cargo test --workspace` is run from the repository root
- **THEN** both `baresync-core` and `tauri-plugin-baresync` compile and any
  tests pass

### Requirement: baresync-core crate compiles with stub modules

The `crates/baresync-core` crate SHALL:

- Use edition 2021
- Depend on `rusqlite` for local SQLite access, `reqwest` (rustls-tls + json),
  `serde` (derive), `serde_json`, `log`, and `tokio` for async facade/runtime support
- Not depend on SQLx for local SQLite access
- Declare public modules `db`, `drizzle_proxy`, and `migrations`
- Each module file SHALL exist and compile (empty or with placeholder items)

#### Scenario: Core crate compiles independently

- **WHEN** `cargo test -p baresync-core` is run
- **THEN** the crate compiles without errors and tests pass

### Requirement: tauri-plugin-baresync crate compiles with tauri dependency

The `crates/tauri-plugin-baresync` crate SHALL:

- Use edition 2021
- Depend on `tauri` 2 and `baresync-core` (path dependency)
- Expose a public `lib.rs` that compiles without errors

#### Scenario: Plugin crate compiles independently

- **WHEN** `cargo test -p tauri-plugin-baresync` is run
- **THEN** the crate compiles without errors and zero tests pass

### Requirement: Dependency versions match Sakti source

Rust dependency versions in both crates SHALL be maintained intentionally for Baresync's current standalone architecture:

- `rusqlite` version SHALL be pinned consistently wherever it is used for local SQLite
- `reqwest` 0.12 (features: rustls-tls, json)
- `serde` 1 (features: derive)
- `serde_json` 1
- `tauri` 2

SQLx SHALL NOT be required by Baresync local database crates after the `rusqlite` backend replacement.

#### Scenario: No SQLx local database dependency remains

- **WHEN** inspecting `crates/baresync-core/Cargo.toml` and `crates/tauri-plugin-baresync/Cargo.toml`
- **THEN** SQLx SHALL NOT be present as a dependency for local SQLite database access
