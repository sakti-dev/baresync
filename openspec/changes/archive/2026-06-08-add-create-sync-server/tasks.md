## 1. Baseline And TDD Guardrails

- [x] 1.1 Read the proposal, design, and delta specs for `add-create-sync-server` before editing source.
- [x] 1.2 Confirm the current working tree with `git status --short`; do not revert unrelated user changes.
- [x] 1.3 Confirm the baseline server handler tests pass before new tests: `bun test packages/baresync/src/server/__test__/handlers.test.ts`.
- [x] 1.4 Confirm the baseline scaffold integration tests pass before new assertions: `bun test packages/create-baresync/src/__test__/integration-templates.test.ts`.
- [x] 1.5 Follow TDD for implementation: add or change the relevant test first, observe the RED failure, implement the minimum change, then verify GREEN.

## 2. RED: Add Grouped Server API Tests

- [x] 2.1 Add tests that import `createSyncServer` from `packages/baresync/src/server`.
- [x] 2.2 Add a grouped server test that orders push changes by `push.upsertOrder`.
- [x] 2.3 Add a grouped server test that replays idempotent push responses using parent-level `db`.
- [x] 2.4 Add a grouped server test that passes the configured pull limit through to `loadPullChanges`.
- [x] 2.5 Add a grouped server test that uses the shared `resolveScope` for status.
- [x] 2.6 Add a denied-scope test that proves no operation callback runs when scope resolution fails.

## 3. GREEN: Implement and Export `createSyncServer`

- [x] 3.1 Add exported `SyncServerOptions` and `SyncServer` types near the existing handler option types.
- [x] 3.2 Implement `createSyncServer` as a thin composition wrapper over the internal push, pull, and status handler logic.
- [x] 3.3 Export `createSyncServer`, `SyncServer`, and `SyncServerOptions` from `packages/baresync/src/server/index.ts`.
- [x] 3.4 Remove the public route API exports for `createSyncPushHandler`, `createSyncPullHandler`, and `createSyncStatusHandler`.

## 4. RED/GREEN: Update Scaffold Templates

- [x] 4.1 Update the scaffold template tests so Hono output expects grouped server wiring with parent-level `db` and `syncServer.push(c.req.raw, {})`.
- [x] 4.2 Update the scaffold template tests so Elysia output expects grouped server wiring with `syncServer.push(request, {})` and body parsing disabled.
- [x] 4.3 Update the Hono scaffold template to create one `syncServer` and pass raw requests directly.
- [x] 4.4 Update the Elysia scaffold template to create one `syncServer`, pass the original `request`, and prevent request-body parsing before Baresync reads it.

## 5. RED/GREEN: Update Inventory Example

- [x] 5.1 Update the inventory server route to import `createSyncServer` and create one grouped server instance.
- [x] 5.2 Pass the parent-level `db` to `createSyncServer` and keep route authorization outside the handler bundle.
- [x] 5.3 Pass `c.req.raw` directly to the grouped handlers.
- [x] 5.4 Verify there are no remaining standalone factory imports or reconstructed `Request` objects in the inventory route.

## 6. RED/GREEN: Update Docs And Skills

- [x] 6.1 Update the primary docs to introduce `createSyncServer` as the canonical server API.
- [x] 6.2 Update the `apps/docs/content/docs/server` deep-dive pages so they describe the grouped server API and raw-request contract.
- [x] 6.3 Update the Baresync skills and source-routing references so agents and contributors see `createSyncServer` as the preferred route bundle API.
- [x] 6.4 Update testing docs and example code to favor grouped server contract tests.

## 7. Red/Green: Sync Main Specs

- [x] 7.1 Sync the delta specs into the main OpenSpec specs so the canonical requirements describe `createSyncServer` only.
- [x] 7.2 Remove compatibility/deprecation language for standalone route factories from the canonical specs.

## 8. Full Verification

- [x] 8.1 Run `bun test packages/baresync/src/server/__test__`.
- [x] 8.2 Run `bun test packages/create-baresync/src/__test__/integration-templates.test.ts`.
- [x] 8.3 Run `bun test examples/inventory-json-polling/apps/server`.
- [x] 8.4 Run `bun x ultracite check`.
- [x] 8.5 Run `bun run typecheck`.
- [x] 8.6 Run `openspec validate add-create-sync-server --strict`.
- [x] 8.7 Run `openspec status --change add-create-sync-server`.

## 9. Implementation Notes For Lower-Cost Agents

- [x] 9.1 Do not reintroduce standalone route factories as the normal integration path.
- [x] 9.2 Do not reconstruct sync route `Request` objects from parsed bodies.
- [x] 9.3 Keep edits scoped to the API, docs, skills, example, scaffold templates, tests, and release notes listed in this change.
