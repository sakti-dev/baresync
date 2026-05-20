import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const locations = sqliteTable(
  "locations",
  {
    id: text("id").primaryKey(),
    scopeId: text("scope_id").notNull(),
    name: text("name").notNull(),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    syncUpdatedAt: integer("sync_updated_at", { mode: "number" })
      .notNull()
      .default(0),
  },
  (table) => [
    index("locations_scope_sync_idx").on(table.scopeId, table.syncUpdatedAt),
  ]
);

export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    scopeId: text("scope_id").notNull(),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id),
    name: text("name").notNull(),
    sku: text("sku"),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    syncUpdatedAt: integer("sync_updated_at", { mode: "number" })
      .notNull()
      .default(0),
  },
  (table) => [
    index("items_scope_sync_idx").on(table.scopeId, table.syncUpdatedAt),
    index("items_location_idx").on(table.locationId),
  ]
);

export const stockCounts = sqliteTable(
  "stock_counts",
  {
    id: text("id").primaryKey(),
    scopeId: text("scope_id").notNull(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id),
    countedQuantity: integer("counted_quantity").notNull(),
    recordedAt: text("recorded_at").notNull(),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    syncUpdatedAt: integer("sync_updated_at", { mode: "number" })
      .notNull()
      .default(0),
  },
  (table) => [
    index("stock_counts_scope_sync_idx").on(table.scopeId, table.syncUpdatedAt),
    index("stock_counts_item_idx").on(table.itemId),
  ]
);
