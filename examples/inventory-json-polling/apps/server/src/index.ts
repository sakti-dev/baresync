import { SYNC_SCOPE } from "@examples/sync-contract/constants";
import { Hono } from "hono";
import { createInventoryDatabase } from "./db/client";
import type { InventoryScope } from "./db/v1/drizzle-helper/sync-repository";
import { createV1Routes } from "./v1/routes";

const app = new Hono();
const { db, dbPath } = await createInventoryDatabase();

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

const v1 = createV1Routes({ db, resolveScope });

app.get("/", (c) => c.text("Hello Hono!"));
app.get("/health", (c) => c.json({ ok: true }));
app.post("/api/v1/sync/push", (c) => v1.push(c.req.raw, {}));
app.post("/api/v1/sync/pull", (c) => v1.pull(c.req.raw, {}));
app.post("/api/v1/sync/status", (c) => v1.status(c.req.raw, {}));

export default app;

console.log(
  `inventory server listening on http://127.0.0.1:${process.env.PORT ?? "3001"}`
);
console.log(`inventory database seeded at ${dbPath}`);
