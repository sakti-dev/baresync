import {
  createSyncPullHandler,
  createSyncPushHandler,
  createSyncStatusHandler,
} from "baresync/server";
import { Hono } from "hono";
import { SYNC_UPSERT_ORDER } from "../../../packages/sync-contract/generated/sync-table-order";
import {
  createIdempotencyDb,
  createSeedState,
  type InventoryScope,
  inventoryState,
} from "./state";

const port = Number(process.env.INVENTORY_SERVER_PORT ?? "18181");
const app = new Hono();

const idempotencyDb = await createIdempotencyDb();
const state = inventoryState(createSeedState());

interface ResolveScopeInput {
  context: unknown;
  request: Request;
  scopeId: string;
}

const resolveScope = ({ scopeId }: ResolveScopeInput) => {
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
  applyPushChanges: ({ changes, scope, syncUpdatedAt }) => {
    state.applyPush(changes, scope.scopeId, syncUpdatedAt);
    return state.toPushResponse();
  },
});

const pull = createSyncPullHandler({
  encoding: "json",
  limit: 1000,
  resolveScope,
  loadPullChanges: ({ scope }) => state.toPullResponse(scope.scopeId),
});

const status = createSyncStatusHandler({
  encoding: "json",
  resolveScope,
  loadSyncStatus: () => state.toStatusResponse(),
});

app.post("/sync/push", (c) => push(c.req.raw, {}));
app.post("/sync/pull", (c) => pull(c.req.raw, {}));
app.post("/sync/status", (c) => status(c.req.raw, {}));
app.get("/health", (c) => c.json({ ok: true }));

const bunRuntime = globalThis as typeof globalThis & {
  Bun: {
    serve: (options: {
      fetch: (request: Request) => Response | Promise<Response>;
      port: number;
    }) => unknown;
  };
};

bunRuntime.Bun.serve({
  fetch: app.fetch,
  port,
});

console.log(`inventory server listening on http://127.0.0.1:${port}`);
