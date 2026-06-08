import { SYNC_SCOPE } from "@sync-contract/constants";
import { createSyncServer } from "baresync/server";
import { Elysia } from "elysia";
import { db } from "../db/client";
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
