## Why

Baresync needs a compilable workspace foundation before any sync logic can be
extracted from the Sakti POS monorepo. The 18-phase PRD and the 4-wave
milestone plan both start with a baseline verification and empty shell
scaffolding step. Without this, Wave 2 extraction streams have no import
targets, no Cargo workspace to publish crates into, and no Bun workspace
package to export from. Doing this first also locks in the `baresync` naming on
npm and Cargo before any code spreads those names across imports, generated
artifacts, and documentation.

## What Changes

- Verify registry availability for `baresync`, `baresync-core`, and
  `tauri-plugin-baresync`.
- Record the current Sakti POS test baseline so later extraction phases can
  prove they did not break the app.
- Add `packages/baresync` to the Bun workspace with subpath exports matching
  the PRD layout, a `limits.ts` with current sync constants, and empty stubs
  for `db`, `schema`, `generator`, `server`, and `tauri` modules.
- Create a root `Cargo.toml` workspace with `crates/baresync-core`,
  `crates/tauri-plugin-baresync`, and the existing POS app crate as members.
- Add empty Rust crates that compile independently with no sync logic.
- Add empty DB modules (`db.rs`, `drizzle_proxy.rs`, `migrations.rs`) in the
  Rust core crate so later phases have stable import paths.
- Keep the POS app compiling unchanged.

## Capabilities

### New Capabilities

- `workspace-shells`: Bun workspace package `baresync` with subpath exports,
  empty module stubs, and a `limits.ts` constants module.
- `cargo-workspace`: Root Cargo workspace with `baresync-core` and
  `tauri-plugin-baresync` crates that compile with empty `lib.rs` and stub
  modules.

### Modified Capabilities

(None — this is the first change in the project.)

## Impact

- **New files**: `packages/baresync/package.json`, `packages/baresync/tsconfig.json`,
  `packages/baresync/src/{index,limits,db/index}.ts`,
  `crates/baresync-core/Cargo.toml`, `crates/baresync-core/src/{lib,db,drizzle_proxy,migrations}.rs`,
  `crates/tauri-plugin-baresync/Cargo.toml`, `crates/tauri-plugin-baresync/src/lib.rs`,
  root `Cargo.toml`.
- **Modified files**: Root `package.json` (workspace already covers `packages/*`),
  `apps/pos-app/src-tauri/Cargo.toml` (add workspace reference if needed).
- **Dependencies**: `baresync-core` depends on `sqlx`, `reqwest`, `serde`,
  `serde_json`, `prost`. `tauri-plugin-baresync` depends on `tauri` and
  `baresync-core`. `packages/baresync` depends on `drizzle-orm`.
- **No behavior change**: Everything is stubs and shells. Existing app
  continues working exactly as before.
