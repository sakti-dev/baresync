## Why

Consumer server integrations should wire a sync route bundle as one grouped object, not as three separate handler factories. The current split API forces repeated `resolveScope` wiring, makes the idempotency database feel push-specific, and encourages framework adapters to reconstruct `Request` objects from parsed bodies.

We want one preferred server API that matches how ordinary consumers think about sync routes: one grouped `createSyncServer({ db, resolveScope, push, pull, status })` object that returns raw-Web-Request handlers for `push`, `pull`, and `status`. The docs, skills, examples, and scaffold templates must teach the same raw `Request` ownership model so push idempotency continues to hash the original request bytes.

## What Changes

- Add `createSyncServer({ db, resolveScope, push, pull, status })` to `baresync/server`.
- Keep the returned `push`, `pull`, and `status` handlers framework-neutral: `(request: Request, context: TContext) => Promise<Response>`.
- Move batteries-included idempotency database configuration to the grouped parent level as `db`.
- Remove the standalone route-factory exports from the public `baresync/server` API.
- Keep the low-level primitives such as `decodeSyncRequest`, `encodeSyncResponse`, `createIdempotencyGuard`, `orderPushChanges`, and validation helpers for custom routes.
- Update Hono scaffold output and example server code to create one `syncServer` and pass `c.req.raw` directly.
- Update Elysia scaffold output and docs to create one `syncServer`, pass the original `request` directly, and configure routes so Elysia does not consume the body before Baresync reads it.
- Update docs, skills, examples, scaffold tests, and release notes to prefer `createSyncServer`.
- Add TDD-shaped tests that first fail on the missing grouped API, stale scaffold output, and missing raw-body guidance, then drive the implementation and docs updates.

This is a hard cut in the public server route API. Consumers should migrate to `createSyncServer` and the raw-request route contract.

## Capabilities

### New Capabilities

- `sync-server-factory`: Preferred grouped server factory and raw Web `Request` integration contract.

### Modified Capabilities

- `server-handler-helpers`: Server route behavior is surfaced through `createSyncServer` only.
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
