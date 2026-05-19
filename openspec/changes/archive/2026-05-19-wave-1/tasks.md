## 1. Registry Verification

- [x] 1.1 Run `npm view baresync name version --json` and confirm E404 or
  document the current owner
- [x] 1.2 Run `cargo search baresync --limit 10` and confirm no matches
- [x] 1.3 Run `cargo search baresync-core --limit 10` and confirm no matches
- [x] 1.4 Run `cargo search tauri-plugin-baresync --limit 10` and confirm no
  matches
- [x] 1.5 If any name is taken, update proposal and design with fallback names
  before proceeding

## 2. JS Package Shell

- [x] 2.1 Create `packages/baresync/package.json` with name `@repo/baresync`,
  type module, all subpath exports, bin entry, and `drizzle-orm` dependency
- [x] 2.2 Create `packages/baresync/tsconfig.json` extending shared config
- [x] 2.3 Create `packages/baresync/src/index.ts` as empty export
- [x] 2.4 Create `packages/baresync/src/cli.ts` as empty placeholder
- [x] 2.5 Create `packages/baresync/src/limits.ts` exporting the four sync
  limit constants
- [x] 2.6 Create empty stub files: `src/schema/index.ts`,
  `src/generator/index.ts`, `src/db/index.ts`, `src/server/index.ts`,
  `src/tauri/index.ts`

## 3. Rust Core Crate Shell

- [x] 3.1 Create `crates/baresync-core/Cargo.toml` with edition 2021 and
  dependencies matching Sakti source versions (sqlx, reqwest, serde, serde_json,
  prost, log, tokio)
- [x] 3.2 Create `crates/baresync-core/src/lib.rs` declaring `pub mod db`,
  `pub mod drizzle_proxy`, `pub mod migrations`
- [x] 3.3 Create `crates/baresync-core/src/db.rs` as empty module
- [x] 3.4 Create `crates/baresync-core/src/drizzle_proxy.rs` as empty module
- [x] 3.5 Create `crates/baresync-core/src/migrations.rs` as empty module

## 4. Tauri Plugin Crate Shell

- [x] 4.1 Create `crates/tauri-plugin-baresync/Cargo.toml` with edition 2021,
  `tauri` 2 dependency, and `baresync-core` path dependency
- [x] 4.2 Create `crates/tauri-plugin-baresync/src/lib.rs` as empty module

## 5. Root Cargo Workspace

- [x] 5.1 Create root `Cargo.toml` with `[workspace]` members
  `crates/baresync-core` and `crates/tauri-plugin-baresync`

## 6. Verification

- [x] 6.1 Run `cargo test --workspace` and confirm both crates compile and
  zero tests pass
- [x] 6.2 Run `bun x ultracite check packages/baresync` and confirm no lint or
  type errors
- [x] 6.3 Verify `packages/baresync/src/limits.ts` exports match expected
  values by running `bun -e "import { DEFAULT_POS_TARGET_PUSH_BYTES, DEFAULT_API_MAX_PUSH_BYTES, DEFAULT_MAX_PUSH_ROWS, DEFAULT_DB_BIND_PARAMETER_BUDGET } from './packages/baresync/src/limits'; console.log(DEFAULT_POS_TARGET_PUSH_BYTES, DEFAULT_API_MAX_PUSH_BYTES, DEFAULT_MAX_PUSH_ROWS, DEFAULT_DB_BIND_PARAMETER_BUDGET)"`
