import { defineSyncConfig } from "baresync/generator";
import * as apiSyncedSchema from "./src/api-synced-schema";
import { SYNC_CONTRACT_PACKAGE_NAME } from "./src/constants";
import * as localSyncedSchema from "./src/local-synced-schema";

export const syncGeneratorConfig = defineSyncConfig({
  apiSyncedSchema,
  localSyncedSchema,
  outputDir: "./generated",
  packageName: SYNC_CONTRACT_PACKAGE_NAME,
  tables: {
    lists: { scope: "scope_id" },
    todos: { scope: "scope_id" },
  },
});
