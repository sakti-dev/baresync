import { Elysia } from "elysia";
import { sync } from "./v1/routes";

const app = new Elysia()
  .get("/health", () => ({ ok: true }))
  .use(sync);

app.listen(Number(process.env.PORT ?? "3001"));

console.log(
  `__PROJECT_NAME__ server listening on http://127.0.0.1:${app.server!.port}`
);
