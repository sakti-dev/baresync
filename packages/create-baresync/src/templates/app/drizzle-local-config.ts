import type { Config } from "drizzle-kit";
import {
  syncCursors,
  syncOutbox,
} from "../../packages/sync-contract/src/local-schema";

const schema = {
  syncCursors,
  syncOutbox,
};

export default {
  dialect: "sqlite",
  schema,
  out: "./apps/app/src-tauri/migrations",
  dbCredentials: {
    url: "./apps/app/src-tauri/migrations/__PROJECT_NAME__.db",
  },
} satisfies Config;
