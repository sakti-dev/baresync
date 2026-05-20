## Why

Baresync currently documents an intended public package name, but the repository still publishes neither the npm package nor the Rust crates in a consumer-ready shape. Preparing the public package surfaces first lets future examples use real install names instead of workspace-only `@repo/*` imports.

## What Changes

- Prepare the TypeScript package for npm publishing as `baresync` instead of the private workspace name.
- Add a build output and package manifest shape that publishes compiled JavaScript, declarations, CLI entrypoint, and intentional subpath exports instead of raw source and tests.
- Prepare `baresync-core` and `tauri-plugin-baresync` for crates.io packaging with standard crate metadata.
- Make the Tauri plugin depend on `baresync-core` with a publishable version while preserving local path-based workspace development.
- Add release validation commands that dry-run or package-check npm and Cargo artifacts before a maintainer publishes.
- Keep actual registry publishing manual and outside this change.

## Capabilities

### New Capabilities

- `package-publishing`: Public npm and crates.io package readiness for Baresync release artifacts.

### Modified Capabilities

- `cargo-workspace`: The plugin crate dependency on `baresync-core` must remain workspace-friendly while also being packageable.

## Impact

- `packages/baresync/package.json`
- `packages/baresync/tsconfig.json` and any package build configuration needed for `dist`
- `packages/baresync/src` public export entrypoints and CLI packaging path, if required by the build output
- `crates/baresync-core/Cargo.toml`
- `crates/tauri-plugin-baresync/Cargo.toml`
- Root scripts or release documentation for package dry runs
- README/package documentation that references public install names
