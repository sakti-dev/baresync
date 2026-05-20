## Context

The inventory example now has two server repository paths:

- `primitive/` keeps the low-level sync plumbing visible.
- `drizzle-helper/` wraps the same behavior in a smaller, Drizzle-shaped repository helper.

The helper-backed path is the one the example app runs by default, so it should be verified as a real path rather than only shown in docs. The existing JS and Rust simulation suites already cover the core sync primitives, but they do not exercise the inventory example's helper-backed repository end to end.

## Goals / Non-Goals

**Goals:**

- Add one focused test that exercises the helper-backed inventory repository flow end to end.
- Keep the test close to how the example app actually uses the repository.
- Prove that the helper-backed path preserves row validation, cursor handling, changed/deleted row splitting, and persistence.
- Keep the primitive path intact as the comparison implementation.

**Non-Goals:**

- Do not add a new generic helper abstraction.
- Do not move route-handler logic into the test.
- Do not test unrelated example app UI or Tauri boundaries.
- Do not replace the existing primitive simulation coverage.

## Decisions

Use the real `examples/inventory/apps/server/src/db/drizzle-helper/sync-repository.ts` repository instead of testing helper internals directly.

Rationale: the user-facing question is whether the helper-backed repository is usable and type-safe in practice. A repository-level test proves that contract more directly than unit testing the helper's internal branches.

Alternatives considered:
- Testing only the helper internals: cheaper, but it would not prove the inventory example wiring or the typed row mapping in context.
- Testing the route handlers: broader, but it adds extra layers that do not help answer the repository question and would make failures harder to diagnose.

Seed a fresh in-memory SQLite database with the actual inventory schema and enough rows to cover the important cases.

Rationale: the helper-backed repository reads and writes real Drizzle tables, so the test should exercise those exact tables and indexes. The seeded data should include rows that can prove status, pull, upsert, and soft-delete behavior.

Alternatives considered:
- Mocking repository callbacks: too abstract and would hide type-safety regressions.
- Reusing the primitive example fixtures only: would not prove the helper-backed path itself.

Keep assertions focused on repository-visible behavior and database state.

Rationale: the test should prove that the repository returns the right shapes and mutates the DB correctly, without depending on incidental implementation details.

Alternatives considered:
- Asserting every internal query step: brittle and too coupled to implementation.
- Only checking that the test does not throw: too weak to be useful.

## Risks / Trade-offs

- [Risk] The test may become a mini integration test with a lot of setup. → Mitigation: keep it to one seeded database and one straight-through flow.
- [Risk] Type-related regressions could still slip through if the test only checks runtime behavior. → Mitigation: seed rows that exercise the explicit `buildRow` validation and assert the repository surfaces the expected fields.
- [Risk] The helper-backed path might drift from the primitive path over time. → Mitigation: keep the primitive example in place and use the new test as the canonical verification for the helper-backed path.
