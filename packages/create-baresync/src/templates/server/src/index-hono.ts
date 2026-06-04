import { Hono } from "hono";
import sync from "./v1/routes";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));
app.route("/api/sync/v1", sync);

export default app;

console.log(
  `__PROJECT_NAME__ server listening on http://127.0.0.1:${process.env.PORT ?? "3001"}`
);
