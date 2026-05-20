import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

function createId() {
  return crypto.randomUUID();
}

export const locations = sqliteTable("locations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  scopeId: text("scope_id").notNull(),
  name: text("name").notNull(),
  deletedAt: text("deleted_at"),
  isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const items = sqliteTable("items", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  scopeId: text("scope_id").notNull(),
  locationId: text("location_id").notNull(),
  name: text("name").notNull(),
  sku: text("sku"),
  deletedAt: text("deleted_at"),
  isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const stockCounts = sqliteTable("stock_counts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  scopeId: text("scope_id").notNull(),
  itemId: text("item_id").notNull(),
  countedQuantity: integer("counted_quantity").notNull(),
  recordedAt: text("recorded_at").notNull(),
  deletedAt: text("deleted_at"),
  isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});
