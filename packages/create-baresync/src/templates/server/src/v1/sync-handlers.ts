import {
  createSyncPullHandler,
  createSyncPushHandler,
  createSyncStatusHandler,
} from "baresync/server";
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

// fallow-ignore-next-line unused-export
export const push = createSyncPushHandler({
  resolveScope,
  upsertOrder: repository.tableNames,
  applyPushChanges: async ({ changes, scope, syncUpdatedAt }) =>
    repository.applyPushChanges({
      changes,
      scopeId: scope.scopeId,
      syncUpdatedAt,
    }),
});

// fallow-ignore-next-line unused-export
export const pull = createSyncPullHandler({
  limit: 1000,
  resolveScope,
  loadPullChanges: async ({ cursor, scope, tables }) =>
    repository.loadPullChanges({
      cursor,
      scopeId: scope.scopeId,
      tables,
    }),
});

// fallow-ignore-next-line unused-export
export const status = createSyncStatusHandler({
  resolveScope,
  loadSyncStatus: async ({ cursor, scope }) =>
    repository.loadSyncStatus({
      cursor,
      scopeId: scope.scopeId,
    }),
});
