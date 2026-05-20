## Context

The repository now supports protobuf transport in the core sync stack, but the public fixture E2E flow still validates the JSON path by default. The fixture app lives under `tests/fixture-app`, the smoke harness lives under `tests/e2e`, and both need a shared transport configuration so the same end-to-end story can run under both encodings.

## Goals / Non-Goals

**Goals:**
- Run the same public fixture smoke scenario against both JSON and protobuf transports.
- Keep the JSON and protobuf smoke flows aligned on data, assertions, and lifecycle behavior.
- Minimize duplication by parameterizing one shared smoke story instead of creating two separate test suites.
- Preserve JSON as the default developer-friendly mode.

**Non-Goals:**
- Exhaustive protocol fuzzing or malformed transport coverage.
- Replacing host-side protocol tests with UI smoke tests.
- Expanding device smoke into conflict-resolution, chunking, or idempotency edge-case testing.

## Decisions

- Use one shared transport mode contract instead of separate fixture apps.
  - Rationale: the public fixture should behave like one product surface with two encodings, not two different apps.
  - Alternatives considered: separate JSON and protobuf fixture apps. Rejected because that duplicates maintenance and encourages drift.

- Reuse one parameterized smoke scenario for both encodings.
  - Rationale: the user-visible behavior should stay identical, and only the wire format should vary.
  - Alternatives considered: independent JSON and protobuf smoke tests. Rejected because they make assertion drift likely and hide semantic differences.

- Keep canonical JSON fixtures as the source of truth.
  - Rationale: protobuf should be derived from the same logical payloads, not become a second canonical fixture format.
  - Alternatives considered: protobuf-only fixtures or dual-source fixtures. Rejected because they increase maintenance burden and make parity harder to verify.

- Keep the fixture app/backend transport switch explicit and configurable.
  - Rationale: transport should be visible in the smoke contract and easy to reason about during debugging.
  - Alternatives considered: implicit transport selection via hidden defaults. Rejected because it makes failures harder to diagnose.

## Risks / Trade-offs

- [Added config surface] → Mitigate by keeping the transport mode contract small and defaulting to JSON.
- [Duplicate smoke paths could drift] → Mitigate by sharing the same scenario runner and the same assertions across both encodings.
- [Protobuf smoke may be slower or flakier on devices] → Mitigate by keeping E2E coverage to the happy path and leaving protocol edge cases to host tests.
- [Android setup may differ from desktop] → Mitigate by using the same transport contract and only varying platform-specific launch plumbing.

## Migration Plan

1. Add the shared transport mode contract to the fixture app/backend smoke wiring.
2. Refactor the E2E smoke scenario so JSON and protobuf use the same assertions and lifecycle steps.
3. Run the desktop smoke matrix for both transports first.
4. Extend the same matrix to Android once the launch plumbing is stable.
5. Update the runbook and verification commands to describe both transports explicitly.

Rollback is straightforward: keep JSON as the default transport and disable the protobuf smoke mode if a regression needs to be isolated.

## Open Questions

- Should the matrix be required in CI for desktop only first, or for both desktop and Android immediately?
- Should the transport mode be selected by an env var, a generated config file, or both?
- Do we want protobuf to be an explicit opt-in smoke mode forever, or eventually make it the default for at least one verification path?
