## Why

The Rust side of the workspace has useful tests, but the measured coverage is still too low for a sync library that needs to be trusted in production apps. We need a deliberate coverage plan so `baresync-core` and `tauri-plugin-baresync` are validated by targeted Rust tests instead of relying mostly on smoke checks.

## What Changes

- Add a Rust coverage policy for the workspace with explicit crate-level targets.
- Expand `baresync-core` coverage with focused unit and simulation tests around sync semantics, transport boundaries, idempotency, cursor handling, and error paths.
- Expand `tauri-plugin-baresync` coverage with builder, command, and transport-selection tests that do not require device infrastructure.
- Keep coverage reporting reproducible through workspace scripts and per-crate `cargo llvm-cov` runs.
- Treat device E2E as complementary smoke validation, not the main source of Rust coverage.

## Capabilities

### New Capabilities
- `rust-test-coverage`: Rust coverage reporting, thresholds, and test-suite expectations for the workspace crates.

### Modified Capabilities
- None.

## Impact

Affected code includes the Rust workspace crates, the coverage scripts in the root workspace package, Rust test files, and the README documentation that reports coverage commands and current measured numbers.
