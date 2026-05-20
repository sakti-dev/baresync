import type { GeneratorConfig } from "baresync/generator";
import { syncedTable, syncSchema } from "baresync/schema";
import { syncBatchRequests } from "./src/api-schema";
import {
  items as apiSyncedItems,
  locations as apiSyncedLocations,
  stockCounts as apiSyncedStockCounts,
} from "./src/api-synced-schema";
import { INVENTORY_PACKAGE_NAME, INVENTORY_SCOPE_ID } from "./src/constants";
import {
  items as localItems,
  locations as localLocations,
  stockCounts as localStockCounts,
} from "./src/local-synced-schema";

export { INVENTORY_PACKAGE_NAME, INVENTORY_SCOPE_ID };

export const apiSchema = {
  syncBatchRequests,
} as const;

export const apiSyncedSchema = {
  items: apiSyncedItems,
  locations: apiSyncedLocations,
  stockCounts: apiSyncedStockCounts,
} as const;

export const localSyncedSchema = {
  items: localItems,
  locations: localLocations,
  stockCounts: localStockCounts,
} as const;

export const syncSchemas = {
  apiSchema,
  apiSyncedSchema,
  localSyncedSchema,
} as const;

const syncedLocations = syncedTable(localLocations, {
  scope: "scope_id",
  localOnlyColumns: ["isSynced"],
});

const syncedItems = syncedTable(localItems, {
  scope: "scope_id",
  localOnlyColumns: ["isSynced"],
});

const syncedStockCounts = syncedTable(localStockCounts, {
  scope: "scope_id",
  localOnlyColumns: ["isSynced"],
});

export const syncContract = syncSchema({
  packageName: INVENTORY_PACKAGE_NAME,
  tables: [syncedLocations, syncedItems, syncedStockCounts],
});

export const syncGeneratorConfig = {
  contract: syncContract,
  outputDir: "./generated",
} satisfies GeneratorConfig;
