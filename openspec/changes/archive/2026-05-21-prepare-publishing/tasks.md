## 1. TypeScript Package Surface

- [x] 1.1 Rename `packages/baresync` package metadata from private `@repo/baresync` to public `baresync`
- [x] 1.2 Add npm package metadata including description, license, repository, files, exports, bin, and package manager compatibility fields
- [x] 1.3 Add a package build that emits compiled JavaScript and declaration files for the root export and `schema`, `generator`, `db`, `server`, `tauri`, and `limits` subpaths
- [x] 1.4 Update package exports and the `baresync` binary to point at compiled `dist` files
- [x] 1.5 Ensure generator templates required at runtime are included in the packed npm artifact
- [x] 1.6 Exclude tests, repository-only sync fixtures, and large test payloads from the packed npm artifact

## 2. Rust Crate Package Metadata

- [x] 2.1 Add crates.io metadata to `crates/baresync-core/Cargo.toml`
- [x] 2.2 Add crates.io metadata to `crates/tauri-plugin-baresync/Cargo.toml`
- [x] 2.3 Add a version requirement to the plugin crate's `baresync-core` dependency while preserving the local path dependency
- [x] 2.4 Verify crate package file lists do not include unintended repository artifacts

## 3. Documentation And Validation

- [x] 3.1 Add or update release-prep scripts for npm build, npm pack dry run, and Cargo package verification
- [x] 3.2 Update README install/import examples to use `baresync` and `tauri-plugin-baresync`
- [x] 3.3 Document that actual npm and crates.io publishing remains a manual maintainer action

## 4. Verification

- [x] 4.1 Run `bun x ultracite check`
- [x] 4.2 Run `bun run typecheck`
- [x] 4.3 Run the TypeScript package build and npm pack dry-run validation
- [x] 4.4 Run `cargo package -p baresync-core --allow-dirty`
- [x] 4.5 Run `cargo package -p tauri-plugin-baresync --allow-dirty`
- [x] 4.6 Run relevant Cargo tests for `baresync-core` and `tauri-plugin-baresync`
