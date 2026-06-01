/** biome-ignore-all lint/performance/noNamespaceImport: Config intentionally groups synced schema exports. */

import { fileURLToPath } from "node:url";
import { defineSyncConfig } from "baresync/generator";
import * as apiSyncedSchema from "./src/api-synced-schema";
import * as localSyncedSchema from "./src/local-synced-schema";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const schemaSourceDir = `${__dirname}src`;

export const syncGeneratorConfig = defineSyncConfig({
  apiSyncedSchema,
  localSyncedSchema,
  outputDir: "./generated",
  schemaSourceDir,
  tables: {
    locations: { scopeColumn: "scope_id" },
    items: { scopeColumn: "scope_id" },
    stockCounts: { scopeColumn: "scope_id" },
  },
});
