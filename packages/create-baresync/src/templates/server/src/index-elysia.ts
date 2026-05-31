import { Elysia } from "elysia";
import { createBaresyncRoutes } from "./sync-route";

const app = new Elysia();

app.use(
  createBaresyncRoutes({
    resolveScope: ({ scopeId }) => ({
      ok: true,
      scope: { scopeId },
    }),
    repository: {
      applyPushChanges: async () => ({ ok: true }),
      loadPullChanges: async () => ({ changedRows: [], deletedIds: [] }),
      loadSyncStatus: async () => ({ changedTables: [], cursor: "" }),
    },
    upsertOrder: ["lists", "todos"],
  })
);

export default app;
