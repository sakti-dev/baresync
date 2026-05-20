# Server Handler Helpers

The server helpers live under `@repo/baresync/server`. They accept Web `Request`
objects and return Web `Response` objects, so framework adapters stay thin.

## Shared setup

```ts
import {
  createSyncPullHandler,
  createSyncPushHandler,
  createSyncStatusHandler,
} from "@repo/baresync/server";

const pushHandler = createSyncPushHandler({
  encoding: "json",
  idempotency: { db },
  upsertOrder: contract.upsertOrder,
  resolveScope: async ({ scopeId, context }) => {
    const session = context.session;

    if (!session || session.merchantId !== scopeId) {
      return {
        ok: false,
        status: 403,
        body: { error: "forbidden" },
      };
    }

    return {
      ok: true,
      scope: { merchantId: session.merchantId },
    };
  },
  applyPushChanges: async ({ changes, scope, syncUpdatedAt }) => {
    await savePushChanges(scope, changes, syncUpdatedAt);
    return {
      serverTime: new Date(syncUpdatedAt).toISOString(),
      tables: [],
    };
  },
});

const statusHandler = createSyncStatusHandler({
  encoding: "json",
  loadSyncStatus: async ({ cursor, scope }) => {
    return loadStatus(scope, cursor);
  },
  resolveScope: async ({ scopeId, context }) => {
    const session = context.session;

    if (!session || session.merchantId !== scopeId) {
      return {
        ok: false,
        status: 403,
        body: { error: "forbidden" },
      };
    }

    return {
      ok: true,
      scope: { merchantId: session.merchantId },
    };
  },
});

const pullHandler = createSyncPullHandler({
  encoding: "json",
  limit: 500,
  loadPullChanges: async ({ cursor, limit, scope, tables }) => {
    return loadPull(scope, tables, cursor, limit);
  },
  resolveScope: async ({ scopeId, context }) => {
    const session = context.session;

    if (!session || session.merchantId !== scopeId) {
      return {
        ok: false,
        status: 403,
        body: { error: "forbidden" },
      };
    }

    return {
      ok: true,
      scope: { merchantId: session.merchantId },
    };
  },
});
```

## Hono

Hono routes should pass `c.req.raw` and any app context into the handler:

```ts
app.post("/sync/push", async (c) => {
  return pushHandler(c.req.raw, {
    session: c.get("session"),
  });
});

app.post("/sync/status", async (c) => {
  return statusHandler(c.req.raw, {
    session: c.get("session"),
  });
});

app.post("/sync/pull", async (c) => {
  return pullHandler(c.req.raw, {
    session: c.get("session"),
  });
});
```

## Elysia

Elysia routes should pass `request` and route context into the handler:

```ts
app.post("/sync/push", async ({ request, session }) => {
  return pushHandler(request, { session });
});

app.post("/sync/status", async ({ request, session }) => {
  return statusHandler(request, { session });
});

app.post("/sync/pull", async ({ request, session }) => {
  return pullHandler(request, { session });
});
```

The handlers stay framework-neutral. Hono, Elysia, Workers, Bun, and plain
fetch handlers can all adapt to the same function signatures.
