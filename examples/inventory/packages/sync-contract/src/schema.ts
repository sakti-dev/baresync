import { localSyncRowState, syncedTable, syncSchema } from "baresync/schema";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const INVENTORY_SCOPE_ID = "default";
export const INVENTORY_PACKAGE_NAME = "inventory.sync.v1";

export const locations = sqliteTable("locations", {
  id: text("id").primaryKey(),
  scopeId: text("scope_id").notNull(),
  name: text("name").notNull(),
  ...localSyncRowState,
});

export const items = sqliteTable("items", {
  id: text("id").primaryKey(),
  scopeId: text("scope_id").notNull(),
  locationId: text("location_id")
    .notNull()
    .references(() => locations.id),
  name: text("name").notNull(),
  sku: text("sku"),
  ...localSyncRowState,
});

export const stockCounts = sqliteTable("stock_counts", {
  id: text("id").primaryKey(),
  scopeId: text("scope_id").notNull(),
  itemId: text("item_id")
    .notNull()
    .references(() => items.id),
  countedQuantity: integer("counted_quantity").notNull(),
  recordedAt: text("recorded_at").notNull(),
  ...localSyncRowState,
});

export const syncedLocations = syncedTable(locations, {
  scope: "scope_id",
  localOnlyColumns: ["isSynced"],
});

export const syncedItems = syncedTable(items, {
  scope: "scope_id",
  localOnlyColumns: ["isSynced"],
});

export const syncedStockCounts = syncedTable(stockCounts, {
  scope: "scope_id",
  localOnlyColumns: ["isSynced"],
});

export const syncContract = syncSchema({
  packageName: INVENTORY_PACKAGE_NAME,
  tables: [syncedLocations, syncedItems, syncedStockCounts],
});
