## Context

Baresync currently exposes three batteries-included framework-neutral server handler factories from `baresync/server`:

```ts
createSyncPushHandler(options);
createSyncPullHandler(options);
createSyncStatusHandler(options);
```

Each returns the same framework-neutral handler shape:

```ts
type SyncHandler<TContext> = (
  request: Request,
  context: TContext
) => Promise<Response>;
```

That low-level shape is correct and should remain. The problem is the consumer route wiring for ordinary server integrations. Every route module repeats `resolveScope`, creates three local handler constants, and puts the idempotency database in a push-only nested field:

```ts
const push = createSyncPushHandler({
  idempotency: { db },
  resolveScope,
  upsertOrder: repository.tableNames,
  applyPushChanges,
});

const pull = createSyncPullHandler({
  limit: 1000,
  resolveScope,
  loadPullChanges,
});

const status = createSyncStatusHandler({
  resolveScope,
  loadSyncStatus,
});
```

The result is noisy scaffolder output and a weak conceptual model: consumers are configuring a sync server bundle, but the public API makes them wire three factories manually.

There is also a request ownership issue in Elysia integrations. Elysia can parse the body into `c.body`, consuming the original request stream. Baresync must read the raw request body itself in `decodeSyncRequest` so push idempotency hashes the exact request bytes. Reconstructing a request with `new Request(c.request.url, { body: JSON.stringify(c.body) })` gives Baresync a fresh stream, but it is not the original byte stream and can change hashing, content length, whitespace, and field ordering semantics.

The preferred route shape after this change is:

```ts
const syncServer = createSyncServer<ScopeContext, ResolvedScope>({
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

Hono route adapters should pass `c.req.raw`:

```ts
sync.post("/push", (c) => syncServer.push(c.req.raw, context));
sync.post("/pull", (c) => syncServer.pull(c.req.raw, context));
sync.post("/status", (c) => syncServer.status(c.req.raw, context));
```

Elysia route adapters should pass the original `request` and disable body parsing for these routes:

```ts
export const sync = new Elysia({ prefix: "/api/sync/v1" })
  .post(
    "/push",
    ({ request }) => syncServer.push(request, {}),
    { parse: "none" }
  )
  .post(
    "/pull",
    ({ request }) => syncServer.pull(request, {}),
    { parse: "none" }
  )
  .post(
    "/status",
    ({ request }) => syncServer.status(request, {}),
    { parse: "none" }
  );
```

The raw request rule is not an Elysia-specific optimization. It is part of the Baresync server contract:

```text
Client HTTP body bytes
  -> Baresync reads request.arrayBuffer()
  -> Baresync computes requestHash
  -> idempotency guard compares clientId + idempotencyKey + requestHash
```

Any framework middleware that consumes the body before Baresync runs can break this model.

## Goals / Non-Goals

**Goals:**

- Add `createSyncServer` as the preferred batteries-included server route API.
- Keep the existing standalone handler factories source-compatible and tested.
- Mark the standalone factories deprecated for batteries-included route wiring while preserving them for compatibility and custom route composition.
- Keep the public handler contract framework-neutral: Web `Request`, app context, Web `Response`.
- Move the batteries-included idempotency `db` to the parent `createSyncServer` options.
- Teach raw Web `Request` ownership consistently in source docs, web docs, skills, examples, and scaffold templates.
- Update Hono examples to pass `c.req.raw` directly.
- Update Elysia examples/templates to pass `request` directly and configure routes so Elysia does not consume the body before Baresync.
- Use TDD for implementation: write focused failing tests before each source/template behavior change, verify the red failure, implement minimally, then verify green.

**Non-Goals:**

- Remove `createSyncPushHandler`, `createSyncPullHandler`, or `createSyncStatusHandler`.
- Change wire protocol request/response bodies.
- Change idempotency table schema or idempotency guard behavior.
- Add framework-specific Baresync exports for Hono, Elysia, Next, Bun, or Workers.
- Add authentication framework behavior to Baresync or the scaffolder.
- Change the sync client header lifecycle.
- Implement downstream private Sakti POS changes inside this public repo.

## Decisions

### Add `createSyncServer` as a thin composition layer

`createSyncServer` should not duplicate push, pull, or status logic. It should compose the existing handler factories.

Expected type shape in `packages/baresync/src/server/handlers.ts`:

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

Expected implementation:

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

Rationale: this keeps the tested standalone handlers as the only implementation of protocol behavior. The new API only removes repeated route wiring.

Alternatives considered:

- Replace the old factories internally with a new shared implementation. Rejected because it increases risk and rewrites stable behavior.
- Export framework-specific route helpers. Rejected because Baresync should stay framework-neutral.
- Only document a userland wrapper. Rejected because the scaffold and docs should have a first-class API.

### Keep the three standalone factories exported but deprecated

The old factories should keep their current behavior and tests. Add JSDoc above each factory:

```ts
/**
 * @deprecated Use createSyncServer for batteries-included server routes.
 * Low-level custom routes should use the exported server primitives directly.
 */
```

Rationale: this change is source-compatible and can ship as a minor version. The deprecation nudges new integrations without breaking existing apps.

Alternatives considered:

- Remove the old factories immediately. Rejected because it would be a breaking API change with little benefit.
- Keep old factories without deprecation. Rejected because docs and generated code would drift back to the old pattern.

### Parent-level `db` owns batteries-included idempotency

`createSyncServer` should accept one parent-level `db`. Internally, only push uses it for `idempotency: { db }`.

Rationale: ordinary consumers think of the database as the sync server backing store, not as a push-only nested detail. Keeping `db` parent-level also makes scaffold templates clearer.

Alternatives considered:

- Keep `idempotency: { db }` nested under `push`. Rejected because it preserves the original abstraction leak.
- Add `idempotency` parent object instead of `db`. Rejected for this change because current public server helpers only need the database, and the plan should avoid inventing options that do not exist yet.

### Preserve raw `Request` ownership as a documented integration rule

Docs and templates must say that Baresync handlers receive the original raw Web `Request`. Framework body parsing must not run before Baresync reads the request body.

Hono:

```ts
sync.post("/push", (c) => syncServer.push(c.req.raw, {}));
```

Elysia:

```ts
.post("/push", ({ request }) => syncServer.push(request, {}), {
  parse: "none",
})
```

Do not teach this pattern:

```ts
syncServer.push(
  new Request(c.request.url, {
    method: "POST",
    headers: c.request.headers,
    body: JSON.stringify(c.body),
  }),
  context
);
```

Rationale: reconstructed requests are not byte-equivalent to the client request. Baresync push idempotency hashes raw request bytes, so request reconstruction weakens conflict detection and payload measurement.

Alternatives considered:

- Accept parsed body input in Baresync handlers. Rejected because it would bypass raw-byte hashing and duplicate parsing paths.
- Clone the request inside Baresync before reading. Rejected because this does not fix middleware that already consumed the body.
- Let each consumer discover framework-specific raw body behavior. Rejected because scaffolds and docs should prevent this class of bug.

### Update source, generated examples, docs, and skills together

The migration must cover:

- Core API and tests.
- `create-baresync` Hono/Elysia route templates and integration tests.
- Inventory example server route.
- Web docs pages and docs component snippets.
- Agent-facing skills under both root `skills/baresync` and packaged `packages/baresync/skills`.
- Release or migration notes if the repository has a changelog/release note file.

Rationale: agents and users copy from docs, examples, scaffolds, and skills. Updating only source would cause future generated code and future agent work to recreate the old pattern.

Alternatives considered:

- Update only the primary getting started page and scaffold templates. Rejected because the reference/API docs and skills would continue to teach the stale API.
- Leave skills for a separate change. Rejected because this repo uses skills as operational guidance for future agents.

### Drive implementation through TDD

Each behavioral or generated-output change should begin with a focused failing test:

- Add `createSyncServer` tests before implementation.
- Flip scaffolder assertions before template edits.
- Add Elysia raw request guidance assertions before template edits.
- Add docs/skill string checks only where existing tests can reasonably cover them; otherwise document manual search verification in tasks.

Rationale: a lower-cost implementation agent needs clear red-green checkpoints and concrete expected failures. The tasks should never instruct implementation before the matching failing test has been observed.

## Risks / Trade-offs

[Risk] `Omit<...>` types may infer `TDb` poorly in `createSyncServer`.
Mitigation: make `createSyncServer` generic over `TContext`, `TScope`, and `TDb extends SyncIdempotencyDatabase = SyncIdempotencyDatabase`; add a typecheck run to verification.

[Risk] Elysia route option syntax may differ by version.
Mitigation: inspect the installed Elysia version and generated template compile behavior during implementation. The desired contract is not the exact syntax; it is that generated Elysia sync routes pass the original `request` without framework body parsing.

[Risk] Documentation may overstate deprecation and make old factories seem removed.
Mitigation: use consistent language: old factories remain available for compatibility and low-level/custom route composition, but `createSyncServer` is preferred for batteries-included route bundles.

[Risk] Docs/skills blast radius can create noisy unrelated edits.
Mitigation: only update references that mention the old route wiring, handler factory imports, idempotency config shape, or raw request guidance. Avoid broader prose rewrites.

[Risk] Reconstructed request workaround may still be needed in a downstream private app until its Elysia route parsing is configured.
Mitigation: the public Baresync repo should document the correct raw-request contract. Downstream apps can carry temporary compatibility workarounds outside this change.

[Risk] `README.md` or release note location may vary.
Mitigation: implementation should search for changelog/release note files. If none exists, update `README.md` and docs reference pages with the migration note.

## Migration Plan

1. Add failing server handler tests for `createSyncServer`.
2. Implement `createSyncServer` as a thin wrapper and export it from `baresync/server`.
3. Mark standalone factories deprecated and keep existing compatibility tests.
4. Add failing scaffold template assertions for grouped API and raw request ownership.
5. Update Hono and Elysia scaffold templates.
6. Update inventory example route to grouped API while keeping Hono raw request behavior and authorization checks.
7. Update docs and skill references.
8. Run focused tests, Ultracite, typecheck, and OpenSpec validation.
9. Ship as a minor version unless maintainers decide to remove the old factories, which is outside this change and would be major.

Rollback strategy:

- If `createSyncServer` causes type inference issues that cannot be resolved quickly, revert the new grouped export and docs/scaffold changes. Existing standalone factories remain untouched.
- If Elysia raw parsing syntax is incompatible with the supported Elysia version, keep `createSyncServer` and update Elysia docs/templates to the supported raw-body route configuration after verifying it with template typecheck.

## Open Questions

- Does the supported Elysia version in generated projects accept `{ parse: "none" }` on route definitions, or does it require a different raw-body configuration spelling?
- Should the deprecation JSDoc use `createSyncServer` only, or explicitly mention `decodeSyncRequest` and `createIdempotencyGuard` as custom-route alternatives?
- Is there an existing changelog/release notes file to update, or should migration notes live only in README/docs?
