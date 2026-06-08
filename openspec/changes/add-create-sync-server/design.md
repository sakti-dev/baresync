## Context

Baresync server integrations should be wired as one grouped route bundle. The public API currently exposes the sync route behavior through `createSyncServer({ db, resolveScope, push, pull, status })`, and the docs/scaffold/examples/skills need to match that hard-cut shape. The grouped handlers must remain framework-neutral and must receive the raw Web `Request`, because push idempotency hashes the original request bytes.

The canonical route shape is:

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

Hono must pass `c.req.raw`. Elysia must pass `request` directly and disable route body parsing on the sync endpoints. No route should rebuild a `Request` from `c.body`.

## Goals

- Expose `createSyncServer` as the only batteries-included server route API.
- Keep the route contract framework-neutral: Web `Request`, app context, Web `Response`.
- Keep the idempotency database on the parent grouped `db` option.
- Remove the standalone factories from the public route API.
- Update docs, scaffold output, skills, examples, and tests to use the grouped server API consistently.

## Non-Goals

- Change the sync wire protocol.
- Change idempotency table schema or behavior.
- Add framework-specific server exports.
- Change the sync client header lifecycle.

## Design

### 1. Public server API

`packages/baresync/src/server/index.ts` should export:

- `createSyncServer`
- `SyncServer`
- `SyncServerOptions`
- the low-level primitives and types already used for custom routes

It should not export `createSyncPushHandler`, `createSyncPullHandler`, or `createSyncStatusHandler` as public route APIs.

### 2. Internal composition

`createSyncServer` can compose the internal push/pull/status handler logic, but the outward-facing shape should only be the grouped server API.

### 3. Scaffold and examples

Generated Hono output should look like:

```ts
const syncServer = createSyncServer({
  db,
  resolveScope,
  push: { upsertOrder: repository.tableNames, applyPushChanges },
  pull: { limit: 1000, loadPullChanges },
  status: { loadSyncStatus },
});

sync.post("/push", (c) => syncServer.push(c.req.raw, {}));
sync.post("/pull", (c) => syncServer.pull(c.req.raw, {}));
sync.post("/status", (c) => syncServer.status(c.req.raw, {}));
```

Generated Elysia output should look like:

```ts
export const sync = new Elysia({ prefix: "/api/sync/v1" })
  .post("/push", ({ request }) => syncServer.push(request, {}), { parse: "none" })
  .post("/pull", ({ request }) => syncServer.pull(request, {}), { parse: "none" })
  .post("/status", ({ request }) => syncServer.status(request, {}), { parse: "none" });
```

### 4. Documentation and skills

Docs and skills should describe `createSyncServer` as the preferred and canonical route integration point. The standalone handler pages may remain as lower-level behavior references, but they should not be presented as the normal route bundle API.

### 5. Tests

TDD should cover:

- grouped server export surface
- grouped push ordering and idempotency replay
- grouped pull limit propagation
- grouped status scope resolution
- scaffold output for Hono and Elysia
- inventory example route shape
- docs and skills examples not reconstructing `Request`

## Risks

- Elysia route parsing behavior can vary by version, so the template and docs must match the repository's supported syntax.
- If any docs or skills continue to mention standalone factories as first-class route APIs, new integrations may drift back to the old shape.
