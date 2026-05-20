/** biome-ignore-all lint/performance/noNamespaceImport: Config intentionally groups synced schema exports. */
import { defineSyncConfig } from "baresync/generator";
import * as apiSyncedSchema from "./src/api-synced-schema";
import { INVENTORY_PACKAGE_NAME } from "./src/constants";
import * as localSyncedSchema from "./src/local-synced-schema";

export const syncGeneratorConfig = defineSyncConfig({
  apiSyncedSchema,
  localSyncedSchema,
  outputDir: "./generated",
  packageName: INVENTORY_PACKAGE_NAME,
  tables: {
    locations: { scope: "scope_id" },
    items: { scope: "scope_id" },
    stockCounts: { scope: "scope_id" },
  },
});
