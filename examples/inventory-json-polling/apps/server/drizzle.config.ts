/// <reference types="node" />

import { defineConfig } from "drizzle-kit";

const databasePath =
  process.env.INVENTORY_SERVER_DB_PATH ?? "./data/inventory-server.db";

export default defineConfig({
  dbCredentials: {
    url: databasePath,
  },
  dialect: "sqlite",
  out: "./drizzle",
  schema: "../../packages/sync-contract/src/api-schema.ts",
});
