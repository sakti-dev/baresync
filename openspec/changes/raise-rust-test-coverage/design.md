## Context

The Rust workspace is already exercised by a mix of unit tests, simulation tests, and fixture-driven smoke tests, but the measured coverage is uneven. `baresync-core` contains most of the sync behavior and should be the primary target for coverage growth, while `tauri-plugin-baresync` is a thinner orchestration layer that still needs direct host-side tests for configuration and command wiring.

The repository already has coverage tooling in place, including `cargo llvm-cov` support and workspace scripts. The design problem is not introducing coverage tooling from scratch; it is deciding how to raise coverage in a way that is stable, reproducible, and worth maintaining.

## Goals / Non-Goals

**Goals:**
- Raise Rust coverage with a focus on the code paths that matter for sync correctness.
- Keep coverage reporting reproducible on this workspace by using per-crate Rust reports.
- Enforce explicit minimum coverage targets for each Rust crate.
- Prefer host-side Rust tests over expensive device or browser-driven smoke flows for coverage growth.

**Non-Goals:**
- Raising JS/Bun coverage in this change.
- Changing runtime sync semantics as the primary outcome.
- Replacing E2E/smoke tests with coverage-only validation.
- Chasing 100% line coverage in either Rust crate.

## Decisions

Use per-crate coverage gates instead of a single workspace-wide gate.

Rationale: `baresync-core` and `tauri-plugin-baresync` have different responsibilities and different feasible coverage ceilings. A workspace-wide number hides where the gaps actually are and makes progress harder to manage. Per-crate gates let us set a higher floor on the engine crate and a lower but still meaningful floor on the plugin crate.

Alternatives considered:
- One combined workspace coverage threshold.
- No threshold, only reporting.
- Per-crate thresholds. Recommended.

Use `cargo llvm-cov` for Rust coverage reporting and fail-under checks.

Rationale: it is the standard Rust-native coverage path already used in the workspace, and it avoids inventing a custom parser or external reporting layer. The per-crate invocation model also matches the current environment constraint where a full workspace run can be too heavy.

Alternatives considered:
- `grcov` or another third-party coverage tool.
- A bespoke script that parses raw coverage output.
- `cargo llvm-cov` with crate-specific runs. Recommended.

Raise `baresync-core` coverage first, then plugin coverage.

Rationale: the core crate contains the actual sync state machine, cursor handling, transport decoding, and reconciliation paths. Improving that crate gives the most confidence per test added. The plugin crate should follow as a wiring layer, with tests focused on config validation, transport selection, and command orchestration.

Alternatives considered:
- Split work evenly between crates from the start.
- Focus on the plugin first because it is easier to test. Rejected.
- Focus on the core first. Recommended.

Keep host-side simulation tests as the primary coverage lever for Rust.

Rationale: the most valuable coverage comes from deterministic tests that exercise the engine and plugin logic without needing Android, a WebView, or a full interactive fixture run. Smoke tests still matter, but they should validate integration rather than carry the coverage burden.

Alternatives considered:
- Drive most coverage through fixture app/device E2E.
- Add more black-box integration tests only.
- Expand host-side simulation and unit coverage. Recommended.

## Risks / Trade-offs

[Risk] Per-crate thresholds can create local pressure to optimize for numbers rather than behavior → Mitigation: keep the thresholds modest and keep the test matrix focused on sync-critical paths, not trivial getters.

[Risk] Coverage tooling can be slow or environment-sensitive → Mitigation: use per-crate runs, keep the coverage command reproducible, and avoid relying on a full workspace aggregate when local storage or linker limits are tight.

[Risk] A higher threshold can cause churn on unrelated changes → Mitigation: ratchet from the current baseline gradually and treat threshold changes as part of coverage work, not incidental edits.

[Risk] E2E tests can be mistaken for coverage tests → Mitigation: keep device smoke tests in their current role and use host-side Rust tests for coverage growth.

## Migration Plan

1. Preserve the current coverage scripts and per-crate reporting model.
2. Add the highest-value Rust tests first in `baresync-core`, then in `tauri-plugin-baresync`.
3. Measure the new baseline after the tests land.
4. Enforce crate-level minimums with a fail-under check.
5. Ratchet the thresholds upward only after the new test coverage has stabilized.

Rollback is straightforward: relax the fail-under threshold temporarily if it blocks unrelated work, but keep the added tests. The tests themselves are the durable value; the threshold is the guardrail.

## Open Questions

- Should the first ratchet target be exactly the current measured baseline plus a small buffer, or should we round to the nearest meaningful floor?
- Should `coverage:rust` continue to report crate-by-crate only, or also include a combined summary for documentation purposes?
- Do we want to gate coverage in CI immediately once the new minimums land, or introduce the gate after one round of test expansion?
