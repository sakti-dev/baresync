import { SYNC_SCOPE } from "@sync-contract/constants";
import {
  createSyncPullHandler,
  createSyncPushHandler,
  createSyncStatusHandler,
} from "baresync/server";
import { Hono } from "hono";
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

const push = createSyncPushHandler({
  idempotency: { db },
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
