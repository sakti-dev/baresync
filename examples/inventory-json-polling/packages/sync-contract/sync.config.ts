import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineSyncConfig } from "baresync/generator";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export const syncGeneratorConfig = defineSyncConfig({
  apiSyncedSchema: path.join(__dirname, "src", "api-synced-schema.ts"),
  localSyncedSchema: path.join(__dirname, "src", "local-synced-schema.ts"),
  outputDir: "./generated",
  tables: {
    locations: { scopeColumn: "scope_id" },
    items: { scopeColumn: "scope_id" },
    stockCounts: { scopeColumn: "scope_id" },
  },
});
