import { Elysia } from "elysia";
import { pull, push, status } from "./sync-handlers";

export const sync = new Elysia({ prefix: "/api/v1/sync" })
  .post("/push", async ({ request }) => push(request, {}))
  .post("/pull", async ({ request }) => pull(request, {}))
  .post("/status", async ({ request }) => status(request, {}));
