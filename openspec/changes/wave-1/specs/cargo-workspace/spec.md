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
- Depend on `sqlx` (SQLite + tokio runtime), `reqwest` (rustls-tls + json),
  `serde` (derive), `serde_json`, `prost`, `log`, and `tokio` (fs feature)
- Declare public modules `db`, `drizzle_proxy`, and `migrations`
- Each module file SHALL exist and compile (empty or with placeholder items)

#### Scenario: Core crate compiles independently

- **WHEN** `cargo test -p baresync-core` is run
- **THEN** the crate compiles without errors and zero tests pass

### Requirement: tauri-plugin-baresync crate compiles with tauri dependency

The `crates/tauri-plugin-baresync` crate SHALL:

- Use edition 2021
- Depend on `tauri` 2 and `baresync-core` (path dependency)
- Expose a public `lib.rs` that compiles without errors

#### Scenario: Plugin crate compiles independently

- **WHEN** `cargo test -p tauri-plugin-baresync` is run
- **THEN** the crate compiles without errors and zero tests pass

### Requirement: Dependency versions match Sakti source

Rust dependency versions in both crates SHALL match the versions used in the
Sakti POS app's `Cargo.toml`:

- `sqlx` 0.8.6 (features: sqlite, runtime-tokio)
- `reqwest` 0.12 (features: rustls-tls, json)
- `prost` 0.13
- `serde` 1 (features: derive)
- `serde_json` 1
- `tauri` 2

#### Scenario: No version mismatch with source

- **WHEN** comparing `crates/baresync-core/Cargo.toml` dependency versions
  against `docs/external/sakti-pos/apps/pos-app/src-tauri/Cargo.toml`
- **THEN** the shared dependency versions are identical
