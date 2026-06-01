import { Hono } from "hono";
import sync from "./v1/routes";

const app = new Hono();

app.get("/", (c) => c.text("Hello Hono!"));
app.get("/health", (c) => c.json({ ok: true }));
app.route("/api/v1/sync", sync);

export default app;

console.log(
  `inventory server listening on http://127.0.0.1:${process.env.PORT ?? "3001"}`
);
console.log("inventory database initialized");
