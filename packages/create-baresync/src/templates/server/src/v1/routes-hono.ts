import { Hono } from "hono";
import { pull, push, status } from "./sync-handlers";

const sync = new Hono();

sync.post("/push", (c) => push(c.req.raw, {}));
sync.post("/pull", (c) => pull(c.req.raw, {}));
sync.post("/status", (c) => status(c.req.raw, {}));

export default sync;
