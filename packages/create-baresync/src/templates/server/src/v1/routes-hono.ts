import { Hono } from "hono";
import { SYNC_SCOPE } from "@sync-contract/constants";
import {
  createSyncPullHandler,
  createSyncPushHandler,
  createSyncStatusHandler,
} from "baresync/server";
import { db } from "../db/client";
import { createAppSyncRepository } from "../db/v1/sync-repository";

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
    scope: { scopeId },
  };
};

const repository = createAppSyncRepository(db);

const push = createSyncPushHandler({
  encoding: "json",
  resolveScope,
  upsertOrder: repository.tableNames,
  applyPushChanges: async ({ changes, scope, syncUpdatedAt }) =>
    repository.applyPushChanges({
      changes,
      scopeId: scope.scopeId,
      syncUpdatedAt,
    }),
});

const pull = createSyncPullHandler({
  encoding: "json",
  limit: 1000,
  resolveScope,
  loadPullChanges: async ({ cursor, scope, tables }) =>
    repository.loadPullChanges({
      cursor,
      scopeId: scope.scopeId,
      tables,
    }),
});

const status = createSyncStatusHandler({
  encoding: "json",
  resolveScope,
  loadSyncStatus: async ({ cursor, scope }) =>
    repository.loadSyncStatus({
      cursor,
      scopeId: scope.scopeId,
    }),
});

const sync = new Hono();

sync.post("/push", (c) => push(c.req.raw, {}));
sync.post("/pull", (c) => pull(c.req.raw, {}));
sync.post("/status", (c) => status(c.req.raw, {}));

export default sync;
