import { SYNC_SCOPE } from "@sync-contract/constants";
import { createSyncServer } from "baresync/server";
import { Hono } from "hono";
import { requireInventoryAuthorization } from "../auth";
import { db } from "../db/client";
import {
  createInventorySyncRepository,
  type InventoryScope,
} from "../db/v1/drizzle-helper/sync-repository";

const resolveScope = ({ scopeId }: { scopeId: string }) => {
  if (scopeId !== SYNC_SCOPE) {
    return {
      ok: false as const,
      status: 403,
      body: { error: "single_scope_only" },
    };
  }

  return {
    ok: true as const,
    scope: { scopeId } satisfies InventoryScope,
  };
};

const repository = createInventorySyncRepository(db);

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

const sync = new Hono();

sync.post("/push", (c) => {
  const authorization = requireInventoryAuthorization(c.req.raw);
  if (!authorization.ok) {
    return c.json(authorization.body, authorization.status);
  }

  return syncServer.push(c.req.raw, {});
});
sync.post("/pull", (c) => {
  const authorization = requireInventoryAuthorization(c.req.raw);
  if (!authorization.ok) {
    return c.json(authorization.body, authorization.status);
  }

  return syncServer.pull(c.req.raw, {});
});
sync.post("/status", (c) => {
  const authorization = requireInventoryAuthorization(c.req.raw);
  if (!authorization.ok) {
    return c.json(authorization.body, authorization.status);
  }

  return syncServer.status(c.req.raw, {});
});

export default sync;
