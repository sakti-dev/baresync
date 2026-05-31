import { createSyncPullHandler, createSyncPushHandler, createSyncStatusHandler } from "baresync/server";

export function createBaresyncRoutes(deps: {
  resolveScope: (input: { scopeId: string }) => { ok: true; scope: { scopeId: string } } | { ok: false; body: { error: string }; status: number };
  repository: {
    applyPushChanges: (input: { changes: unknown[]; scopeId: string; syncUpdatedAt: number }) => Promise<unknown>;
    loadPullChanges: (input: { cursor: string; scopeId: string; tables: string[] }) => Promise<unknown>;
    loadSyncStatus: (input: { cursor: string; scopeId: string }) => Promise<unknown>;
  };
  upsertOrder: string[];
}) {
  const push = createSyncPushHandler({
    encoding: "json",
    resolveScope: deps.resolveScope,
    upsertOrder: deps.upsertOrder,
    applyPushChanges: async ({ changes, scope, syncUpdatedAt }) =>
      deps.repository.applyPushChanges({
        changes,
        scopeId: scope.scopeId,
        syncUpdatedAt,
      }),
  });

  const pull = createSyncPullHandler({
    encoding: "json",
    resolveScope: deps.resolveScope,
    loadPullChanges: async ({ cursor, scope, tables }) =>
      deps.repository.loadPullChanges({
        cursor,
        scopeId: scope.scopeId,
        tables,
      }),
  });

  const status = createSyncStatusHandler({
    encoding: "json",
    resolveScope: deps.resolveScope,
    loadSyncStatus: async ({ cursor, scope }) =>
      deps.repository.loadSyncStatus({
        cursor,
        scopeId: scope.scopeId,
      }),
  });

  return { pull, push, status };
}
