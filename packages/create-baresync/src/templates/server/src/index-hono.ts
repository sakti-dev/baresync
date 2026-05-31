import { Hono } from "hono";
import { createBaresyncRoutes } from "./sync-routes";

const app = new Hono();

app.route("/api/v1/sync", createBaresyncRoutes({
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
}));

export default app;
