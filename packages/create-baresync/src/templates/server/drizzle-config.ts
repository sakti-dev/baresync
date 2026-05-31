import type { Config } from "drizzle-kit";
import { syncBatchRequests } from "../../packages/sync-contract/src/api-schema";

const schema = {
  syncBatchRequests,
};

export default {
  dialect: "sqlite",
  schema,
  out: "./drizzle",
  dbCredentials: {
    url: "./data/__PROJECT_NAME__-server.db",
  },
} satisfies Config;
