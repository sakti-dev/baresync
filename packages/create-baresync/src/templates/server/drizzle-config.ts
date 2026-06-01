import { defineConfig } from "drizzle-kit";
import { syncBatchRequests } from "../../packages/sync-contract/src/api-schema";

const schema = {
  syncBatchRequests,
};

export default defineConfig({
  dialect: "sqlite",
  schema,
  out: "./drizzle",
  dbCredentials: {
    url: process.env.__PROJECT_NAME___SERVER_DB_PATH ?? "./data/__PROJECT_NAME__-server.db",
  },
});
