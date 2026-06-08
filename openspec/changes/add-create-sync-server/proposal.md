## Why

Consumer server integrations currently have to compose three separate batteries-included handler factories:
`createSyncPushHandler`, `createSyncPullHandler`, and `createSyncStatusHandler`. That shape leaks too much internal wiring into route modules: `db` is nested only under push idempotency, `resolveScope` is repeated three times, and downstream Elysia routes are prone to reconstructing `Request` objects from parsed bodies after the framework has consumed the original stream.

We need one preferred grouped server API that matches how consumers think about a sync route bundle, while keeping the old factories available for compatibility and low-level/custom use. The docs, skills, examples, and scaffold templates must all teach the same raw Web `Request` ownership model so future integrations do not lose push idempotency byte semantics.

## What Changes

- Add a new framework-neutral `createSyncServer({ db, resolveScope, push, pull, status })` factory exported from `baresync/server`.
- Return a grouped `{ push, pull, status }` handler object where each handler keeps the existing `(request: Request, context: TContext) => Promise<Response>` contract.
- Move the batteries-included idempotency database config to the grouped parent level as `db`, while adapting internally to the existing push idempotency guard.
- Preserve `createSyncPushHandler`, `createSyncPullHandler`, and `createSyncStatusHandler` as source-compatible exports, but mark them deprecated for batteries-included route wiring.
- Keep low-level primitives such as `decodeSyncRequest`, `encodeSyncResponse`, `createIdempotencyGuard`, `orderPushChanges`, and validation helpers as the custom-route API.
- Update Hono scaffold output and examples to create one `syncServer` and pass `c.req.raw` directly.
- Update Elysia scaffold output and docs to create one `syncServer`, pass the original `request` directly, and configure routes so Elysia does not consume the body before Baresync reads it.
- Update web docs under `apps/docs`, embedded docs examples, Baresync skill references under `skills/baresync` and `packages/baresync/skills`, the inventory example, scaffold tests, and release/migration notes to prefer `createSyncServer`.
- Add TDD-shaped tests that first fail on the missing grouped API, stale scaffold output, and missing raw-body guidance, then drive the implementation and docs updates.

No breaking changes are intended. Existing standalone handler factories remain exported and tested during the deprecation period.

## Capabilities

### New Capabilities

- `sync-server-factory`: Preferred grouped batteries-included server factory and raw Web `Request` integration contract.

### Modified Capabilities

- `server-handler-helpers`: Existing framework-neutral handler requirements gain the grouped `createSyncServer` API and deprecation requirements for the three standalone factories.
- `project-scaffolder`: Generated Hono and Elysia server route templates must use `createSyncServer`, avoid standalone handler imports, and preserve raw request ownership.
- `inventory-example`: The inventory JSON polling example must demonstrate the grouped server API while retaining authorization and raw Hono request behavior.
- `baresync-skill-guidance`: Agent-facing Baresync skills must prefer `createSyncServer` and warn about framework body parsing before Baresync reads the request.

## Impact

Affected source and tests:

- `packages/baresync/src/server/handlers.ts`
- `packages/baresync/src/server/index.ts`
- `packages/baresync/src/server/__test__/handlers.test.ts`
- `packages/create-baresync/src/templates/server/src/v1/routes-hono.ts`
- `packages/create-baresync/src/templates/server/src/v1/routes-elysia.ts`
- `packages/create-baresync/src/__test__/integration-templates.test.ts`
- `examples/inventory-json-polling/apps/server/src/v1/routes.ts`
- Example server tests if present

Affected docs and skills:

- `README.md`
- `apps/docs/content/docs/getting-started/server-routes.mdx`
- `apps/docs/content/docs/reference/typescript-api.mdx`
- `apps/docs/content/docs/server/overview.mdx`
- `apps/docs/content/docs/server/push-handler.mdx`
- `apps/docs/content/docs/server/pull-handler.mdx`
- `apps/docs/content/docs/server/status-handler.mdx`
- `apps/docs/content/docs/server/idempotency.mdx`
- `apps/docs/content/docs/server/drizzle-repository-helper.mdx`
- `apps/docs/content/docs/server/scope-resolution.mdx`
- `apps/docs/content/docs/testing/server-contract-tests.mdx`
- `apps/docs/content/docs/architecture.mdx`
- `apps/docs/content/docs/generator/generated-files.mdx`
- `apps/docs/content/docs/running-in-production/configuration.mdx`
- `apps/docs/src/components/sync-slider.tsx`
- `skills/baresync/SKILL.md`
- `skills/baresync/reference/server.md`
- `skills/baresync/reference/source.md`
- `skills/baresync/reference/testing.md`
- `skills/baresync/reference/generator.md`
- `skills/baresync/reference/verify.md`
- `packages/baresync/skills/reference/server.md`

Verification impact:

- Focused server handler tests.
- Scaffold integration template tests.
- Example server tests where available.
- `bun x ultracite check`.
- `bun run typecheck`.
- OpenSpec validation for this change.
