import { SYNC_UPSERT_ORDER } from "@example/inventory-sync-contract/generated/sync-table-order";
import {
  createSyncPullHandler,
  createSyncPushHandler,
  createSyncStatusHandler,
} from "baresync/server";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { Hono } from "hono";
import { createInventoryDatabase } from "./db/client";
import {
  createInventorySyncRepository,
  type InventoryScope,
} from "./db/drizzle-helper/sync-repository";

const app = new Hono();
const { db, dbPath } = await createInventoryDatabase();
const repository = createInventorySyncRepository(db);
const idempotencyDb = db as unknown as SqliteRemoteDatabase;

const resolveScope = ({ scopeId }: { scopeId: string }) => {
  if (scopeId !== "default") {
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

const push = createSyncPushHandler({
  encoding: "json",
  idempotency: { db: idempotencyDb },
  resolveScope,
  upsertOrder: SYNC_UPSERT_ORDER,
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

app.get("/", (c) => c.text("Hello Hono!"));
app.get("/health", (c) => c.json({ ok: true }));
app.post("/sync/push", (c) => push(c.req.raw, {}));
app.post("/sync/pull", (c) => pull(c.req.raw, {}));
app.post("/sync/status", (c) => status(c.req.raw, {}));

export default app;

console.log(
  `inventory server listening on http://127.0.0.1:${process.env.PORT ?? "3001"}`
);
console.log(`inventory database seeded at ${dbPath}`);
