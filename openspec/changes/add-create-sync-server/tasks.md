## 1. Baseline And TDD Guardrails

- [ ] 1.1 Read `openspec/changes/add-create-sync-server/proposal.md`, `openspec/changes/add-create-sync-server/design.md`, and all specs under `openspec/changes/add-create-sync-server/specs/` before editing source.
- [ ] 1.2 Confirm the current working tree with `git status --short`; do not revert unrelated user changes.
- [ ] 1.3 Confirm the baseline server handler tests pass before new tests: `bun test packages/baresync/src/server/__test__/handlers.test.ts`.
- [ ] 1.4 Confirm the baseline scaffold integration tests pass before new assertions: `bun test packages/create-baresync/src/__test__/integration-templates.test.ts`.
- [ ] 1.5 Follow TDD for implementation code: add or change the relevant test first, run the focused command, confirm the failure is because the behavior is missing, then implement the minimum code to pass.

## 2. RED: Add Grouped Server API Tests

- [ ] 2.1 Modify `packages/baresync/src/server/__test__/handlers.test.ts` to import `createSyncServer` from `../handlers`; this should fail before implementation because the export does not exist.
- [ ] 2.2 Add a `describe("createSyncServer", ...)` block that creates a grouped server with typed context and scope:

```ts
const sync = createSyncServer<
  { sessionId: string },
  { merchantId: string }
>({
  db,
  resolveScope: vi.fn(async ({ scopeId }) =>
    authorizedScope({ merchantId: scopeId })
  ),
  push: {
    applyPushChanges: vi.fn(async (input) => ({
      acceptedTables: input.changes.map((change) => change.table),
      scopeId: input.scopeId,
      serverTime: "2026-06-08T00:00:00.000Z",
    })),
    upsertOrder: ["categories", "products"],
  },
  pull: {
    limit: 25,
    loadPullChanges: vi.fn(async (input) => ({
      cursor: input.cursor,
      hasMore: false,
      serverTime: "2026-06-08T00:00:00.000Z",
      tables: input.tables.map((table) => ({
        changedRows: [],
        deletedIds: [],
        table,
      })),
    })),
  },
  status: {
    loadSyncStatus: vi.fn(async (input) => ({
      changedTables: ["categories"],
      cursor: input.cursor,
      hasChanges: true,
      serverTime: "2026-06-08T00:00:00.000Z",
    })),
  },
});
```

- [ ] 2.3 Add a test named `orders grouped push changes and returns the push body` that sends a push request with `products` before `categories`, calls `sync.push(request, { sessionId: "session-1" })`, and expects `acceptedTables: ["categories", "products"]`.
- [ ] 2.4 Add a test named `replays grouped idempotent push responses using the parent db` that sends the same push request twice through `sync.push`, expects both responses to match, and expects `applyPushChanges` to have been called once.
- [ ] 2.5 Add a test named `passes grouped pull limit to loadPullChanges` that calls `sync.pull`, captures `loadPullChanges.mock.calls[0][0].limit`, and expects `25`.
- [ ] 2.6 Add a test named `uses grouped resolveScope for status` that calls `sync.status`, expects `resolveScope` to receive the request `scopeId`, and expects `loadSyncStatus` to receive the resolved scope.
- [ ] 2.7 Add a denied-scope test that configures `resolveScope` to return `unauthorizedScope({ error: "forbidden" }, 403)`, calls `sync.push`, and expects the operation callback not to run.
- [ ] 2.8 Run `bun test packages/baresync/src/server/__test__/handlers.test.ts` and confirm RED: failure should be caused by missing `createSyncServer` export or missing implementation, not syntax errors.

## 3. GREEN: Implement `createSyncServer`

- [ ] 3.1 In `packages/baresync/src/server/handlers.ts`, add exported `SyncServerOptions` and `SyncServer` types near the existing handler option types.
- [ ] 3.2 Use this type shape, adjusting only for local formatting or type inference needs:

```ts
export interface SyncServerOptions<
  TContext,
  TScope,
  TDb extends SyncIdempotencyDatabase = SyncIdempotencyDatabase,
> {
  db: TDb;
  resolveScope: (
    input: SyncResolveScopeInput<TContext>
  ) => Awaitable<SyncScopeResolution<TScope>>;
  push: Omit<
    SyncPushHandlerOptions<TContext, TScope, TDb>,
    "idempotency" | "resolveScope"
  >;
  pull: Omit<SyncPullHandlerOptions<TContext, TScope>, "resolveScope">;
  status: Omit<SyncStatusHandlerOptions<TContext, TScope>, "resolveScope">;
}

export interface SyncServer<TContext> {
  push: SyncHandler<TContext>;
  pull: SyncHandler<TContext>;
  status: SyncHandler<TContext>;
}
```

- [ ] 3.3 In `packages/baresync/src/server/handlers.ts`, implement `createSyncServer` as a thin composition wrapper over `createSyncPushHandler`, `createSyncPullHandler`, and `createSyncStatusHandler`.
- [ ] 3.4 Use this implementation shape, adding the `TDb` generic if TypeScript inference requires it:

```ts
export function createSyncServer<
  TContext,
  TScope,
  TDb extends SyncIdempotencyDatabase = SyncIdempotencyDatabase,
>(options: SyncServerOptions<TContext, TScope, TDb>): SyncServer<TContext> {
  return {
    push: createSyncPushHandler({
      ...options.push,
      idempotency: { db: options.db },
      resolveScope: options.resolveScope,
    }),
    pull: createSyncPullHandler({
      ...options.pull,
      resolveScope: options.resolveScope,
    }),
    status: createSyncStatusHandler({
      ...options.status,
      resolveScope: options.resolveScope,
    }),
  };
}
```

- [ ] 3.5 In `packages/baresync/src/server/index.ts`, import and export `createSyncServer`, `type SyncServer`, and `type SyncServerOptions`.
- [ ] 3.6 Run `bun test packages/baresync/src/server/__test__/handlers.test.ts` and confirm GREEN for the new tests and existing standalone handler tests.

## 4. RED/GREEN: Deprecate Standalone Factories Without Breaking Compatibility

- [ ] 4.1 Before changing JSDoc, inspect the existing standalone tests in `packages/baresync/src/server/__test__/handlers.test.ts` and keep them intact as compatibility tests.
- [ ] 4.2 Add JSDoc immediately above `createSyncPushHandler`, `createSyncPullHandler`, and `createSyncStatusHandler` in `packages/baresync/src/server/handlers.ts`:

```ts
/**
 * @deprecated Use createSyncServer for batteries-included server routes.
 * Low-level custom routes should use the exported server primitives directly.
 */
```

- [ ] 4.3 Run `bun test packages/baresync/src/server/__test__/handlers.test.ts` and confirm all standalone and grouped tests still pass.
- [ ] 4.4 Run `bun run typecheck` after the grouped types export to catch public type-surface issues.

## 5. RED: Update Scaffold Template Assertions

- [ ] 5.1 Modify `packages/create-baresync/src/__test__/integration-templates.test.ts` so the Hono route assertions expect grouped API output:

```ts
expect(routes?.content).toContain("createSyncServer");
expect(routes?.content).toContain("db,");
expect(routes?.content).toContain("push:");
expect(routes?.content).toContain("pull:");
expect(routes?.content).toContain("status:");
expect(routes?.content).toContain("syncServer.push(c.req.raw");
expect(routes?.content).not.toContain("createSyncPushHandler");
expect(routes?.content).not.toContain("createSyncPullHandler");
expect(routes?.content).not.toContain("createSyncStatusHandler");
expect(routes?.content).not.toContain("idempotency: { db }");
expect(routes?.content).not.toContain("new Request(");
```

- [ ] 5.2 Modify the Elysia route assertions to expect grouped API output and raw request ownership:

```ts
expect(routes?.content).toContain("createSyncServer");
expect(routes?.content).toContain("syncServer.push(request");
expect(routes?.content).toContain("syncServer.pull(request");
expect(routes?.content).toContain("syncServer.status(request");
expect(routes?.content).toContain('parse: "none"');
expect(routes?.content).not.toContain("createSyncPushHandler");
expect(routes?.content).not.toContain("createSyncPullHandler");
expect(routes?.content).not.toContain("createSyncStatusHandler");
expect(routes?.content).not.toContain("idempotency: { db }");
expect(routes?.content).not.toContain("new Request(");
expect(routes?.content).not.toContain("JSON.stringify(c.body)");
```

- [ ] 5.3 Run `bun test packages/create-baresync/src/__test__/integration-templates.test.ts` and confirm RED: tests should fail because templates still import and use the old standalone factories.

## 6. GREEN: Update Scaffold Templates

- [ ] 6.1 In `packages/create-baresync/src/templates/server/src/v1/routes-hono.ts`, replace the three standalone imports with `import { createSyncServer } from "baresync/server";`.
- [ ] 6.2 In the Hono template, replace `const push`, `const pull`, and `const status` with one grouped `syncServer`:

```ts
const syncServer = createSyncServer({
  db,
  resolveScope,
  push: {
    upsertOrder: repository.tableNames,
    applyPushChanges: async ({ changes, scope, syncUpdatedAt }) =>
      repository.applyPushChanges({
        changes,
        scopeId: scope.scopeId,
        syncUpdatedAt,
      }),
  },
  pull: {
    limit: 1000,
    loadPullChanges: async ({ cursor, scope, tables }) =>
      repository.loadPullChanges({
        cursor,
        scopeId: scope.scopeId,
        tables,
      }),
  },
  status: {
    loadSyncStatus: async ({ cursor, scope }) =>
      repository.loadSyncStatus({
        cursor,
        scopeId: scope.scopeId,
      }),
  },
});
```

- [ ] 6.3 In the Hono template, mount raw requests directly:

```ts
sync.post("/push", (c) => syncServer.push(c.req.raw, {}));
sync.post("/pull", (c) => syncServer.pull(c.req.raw, {}));
sync.post("/status", (c) => syncServer.status(c.req.raw, {}));
```

- [ ] 6.4 In `packages/create-baresync/src/templates/server/src/v1/routes-elysia.ts`, replace the three standalone imports with `import { createSyncServer } from "baresync/server";`.
- [ ] 6.5 In the Elysia template, use the same grouped `syncServer` setup as the Hono template.
- [ ] 6.6 In the Elysia template, mount routes with the original `request` and route parsing disabled for sync bodies:

```ts
export const sync = new Elysia({ prefix: "/api/sync/v1" })
  .post(
    "/push",
    async ({ request }) => syncServer.push(request, {}),
    { parse: "none" }
  )
  .post(
    "/pull",
    async ({ request }) => syncServer.pull(request, {}),
    { parse: "none" }
  )
  .post(
    "/status",
    async ({ request }) => syncServer.status(request, {}),
    { parse: "none" }
  );
```

- [ ] 6.7 If Elysia typecheck fails because this repository's supported Elysia version uses different raw-body route syntax, inspect the installed Elysia types/docs and replace `{ parse: "none" }` with the supported equivalent that prevents body parsing while still passing `request` directly.
- [ ] 6.8 Run `bun test packages/create-baresync/src/__test__/integration-templates.test.ts` and confirm GREEN.
- [ ] 6.9 Run `bun run typecheck:create` or `bun run typecheck` to confirm template test code typechecks.

## 7. RED/GREEN: Update Inventory Example

- [ ] 7.1 Add or update a focused assertion if an example server route test exists; otherwise use the scaffold-style source search checks in task 7.5 as manual verification.
- [ ] 7.2 In `examples/inventory-json-polling/apps/server/src/v1/routes.ts`, replace standalone factory imports with `import { createSyncServer } from "baresync/server";`.
- [ ] 7.3 Replace local `push`, `pull`, and `status` constants with one `syncServer` using parent-level `db`, shared `resolveScope`, and nested `push`, `pull`, and `status` callbacks.
- [ ] 7.4 Keep existing `requireInventoryAuthorization(c.req.raw)` checks before invoking Baresync, and keep Hono route mounting on the original raw request:

```ts
return syncServer.push(c.req.raw, {});
return syncServer.pull(c.req.raw, {});
return syncServer.status(c.req.raw, {});
```

- [ ] 7.5 Verify the example route manually with `rg -n "createSync(Push|Pull|Status)Handler|idempotency: \\{ db \\}|new Request\\(" examples/inventory-json-polling/apps/server/src/v1/routes.ts`; expected result: no matches.
- [ ] 7.6 Run `bun test examples/inventory-json-polling/apps/server`; if Bun reports no tests, note that and rely on `bun run typecheck`.

## 8. RED/GREEN: Update Web Docs And Embedded Docs Example

- [ ] 8.1 Update primary docs first: `README.md`, `apps/docs/content/docs/getting-started/server-routes.mdx`, and `apps/docs/content/docs/reference/typescript-api.mdx` to introduce `createSyncServer` as the preferred batteries-included API.
- [ ] 8.2 In primary docs, include this migration note:

```md
`createSyncPushHandler`, `createSyncPullHandler`, and
`createSyncStatusHandler` remain available for compatibility, but
`createSyncServer` is the preferred batteries-included integration path.
For custom protocol work, use the low-level primitives exported from
`baresync/server`.
```

- [ ] 8.3 In primary docs, include this raw request rule:

```md
Pass the raw Web `Request` to `syncServer.push`, `syncServer.pull`, and
`syncServer.status`. Avoid framework middleware that consumes the body before
Baresync reads it, because push idempotency hashes the raw request bytes.
```

- [ ] 8.4 Update supporting web docs that currently teach the old route shape: `apps/docs/content/docs/server/overview.mdx`, `apps/docs/content/docs/server/push-handler.mdx`, `apps/docs/content/docs/server/pull-handler.mdx`, `apps/docs/content/docs/server/status-handler.mdx`, `apps/docs/content/docs/server/idempotency.mdx`, `apps/docs/content/docs/server/drizzle-repository-helper.mdx`, `apps/docs/content/docs/server/scope-resolution.mdx`, `apps/docs/content/docs/testing/server-contract-tests.mdx`, `apps/docs/content/docs/architecture.mdx`, `apps/docs/content/docs/generator/generated-files.mdx`, and `apps/docs/content/docs/running-in-production/configuration.mdx`.
- [ ] 8.5 Preserve standalone handler docs where they are specifically about low-level/custom handler behavior, but label them compatibility or low-level APIs rather than the main batteries-included route path.
- [ ] 8.6 Update `apps/docs/src/components/sync-slider.tsx` so the embedded code snippet shows `createSyncServer`, parent-level `db`, nested `push`/`pull`/`status`, and `syncServer.*(c.req.raw, {})`.
- [ ] 8.7 Run `rg -n "createSync(Push|Pull|Status)Handler|idempotency: \\{ db \\}" apps/docs README.md` and review every remaining match; each remaining match must be intentional compatibility/low-level documentation.

## 9. RED/GREEN: Update Baresync Skills

- [ ] 9.1 Update `skills/baresync/SKILL.md` so the server routes summary names `createSyncServer` as the preferred route bundle API.
- [ ] 9.2 Update `skills/baresync/reference/server.md` with a primary grouped server example and raw request guidance for Hono and Elysia.
- [ ] 9.3 Update `packages/baresync/skills/reference/server.md` with the same primary grouped server example and raw request guidance.
- [ ] 9.4 Update `skills/baresync/reference/source.md` so source lookup guidance points to `createSyncServer` for the grouped server API while still mentioning standalone factories as compatibility/low-level entries.
- [ ] 9.5 Update `skills/baresync/reference/testing.md` so server contract examples prefer creating a grouped `syncServer` when testing a full route bundle; standalone factory examples may remain only for targeted low-level tests.
- [ ] 9.6 Update `skills/baresync/reference/generator.md` and `skills/baresync/reference/verify.md` where they mention the server push handler or verification expectations.
- [ ] 9.7 Run `rg -n "createSync(Push|Pull|Status)Handler|idempotency: \\{ db \\}|new Request\\(|JSON.stringify\\(c.body\\)" skills/baresync packages/baresync/skills` and review every remaining match; each remaining match must be intentional compatibility/low-level guidance.

## 10. Release Notes And Public API Sweep

- [ ] 10.1 Search for changelog or release note files with `rg --files | rg -i "change|release|version|readme"` and identify the correct place for a user-facing note.
- [ ] 10.2 Add a concise release/migration note in the selected location:

```md
- Added `createSyncServer` as the preferred batteries-included server route API.
- `db` now lives at the parent grouped server config.
- `createSyncPushHandler`, `createSyncPullHandler`, and `createSyncStatusHandler` remain available for compatibility but are deprecated for route bundles.
- Pass the original raw Web `Request` to Baresync handlers; avoid framework body parsing before Baresync reads the request.
```

- [ ] 10.3 Confirm `packages/baresync/src/server/index.ts` exports the grouped function and types from the public `baresync/server` subpath.
- [ ] 10.4 If package versions are bumped as part of release preparation, remind the user to create and push the package-prefixed tag, for example `baresync@x.y.z`.

## 11. Full Verification

- [ ] 11.1 Run `bun test packages/baresync/src/server/__test__`.
- [ ] 11.2 Run `bun test packages/create-baresync/src/__test__/integration-templates.test.ts`.
- [ ] 11.3 Run `bun test examples/inventory-json-polling/apps/server`; if no tests are found, record that result.
- [ ] 11.4 Run `bun x ultracite check`.
- [ ] 11.5 If Ultracite reports formatting or safe fixable lint issues, run `bun x ultracite fix`, then rerun `bun x ultracite check`.
- [ ] 11.6 Run `bun run typecheck`.
- [ ] 11.7 Run `openspec validate add-create-sync-server --strict`.
- [ ] 11.8 Run `openspec status --change add-create-sync-server` and confirm all artifacts remain complete.

## 12. Implementation Notes For Lower-Cost Agents

- [ ] 12.1 Do not implement source changes before the matching failing test has been run and the expected RED failure has been observed.
- [ ] 12.2 Do not remove the standalone factories or their tests.
- [ ] 12.3 Do not add Hono/Elysia-specific exports to `baresync/server`; adapters remain in consumer route code and docs.
- [ ] 12.4 Do not reconstruct sync route `Request` objects from parsed bodies in templates, examples, or docs.
- [ ] 12.5 Do not broaden auth behavior; `resolveScope` remains app-owned and auth headers remain app/plugin-owned.
- [ ] 12.6 Keep edits scoped to the API, docs, skills, example, scaffold templates, tests, and release notes listed in this change.
