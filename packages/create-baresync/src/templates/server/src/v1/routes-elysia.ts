import {
  createSyncPullHandler,
  createSyncPushHandler,
  createSyncStatusHandler,
} from "baresync/server";
import { Elysia } from "elysia";
import { SYNC_SCOPE } from "@sync-contract/constants";
import { repository } from "../db/v1/sync-repository";

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

const push = createSyncPushHandler({
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

export const sync = new Elysia({ prefix: "/api/v1/sync" })
  .post("/push", async ({ request }) => push(request, {}))
  .post("/pull", async ({ request }) => pull(request, {}))
  .post("/status", async ({ request }) => status(request, {}));
