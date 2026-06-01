import { createTauriDrizzleDatabase, type InvokeFn } from "@repo/baresync/db";
import { syncedTable, syncSchema } from "@repo/baresync/schema";
import { createSyncClient } from "@repo/baresync/tauri";
import { invoke } from "@tauri-apps/api/core";
import { desc } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { FixtureTransportMode } from "../../e2e/fixture-transport";

export const fixtureScopeId = "merchant-1";
export const fixturePackageName = "com.baresync.fixture.sync.v1";

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  deletedAt: text("deleted_at"),
  isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  categoryId: text("category_id").notNull(),
  name: text("name").notNull(),
  priceMinorUnits: integer("price_minor_units").notNull(),
  deletedAt: text("deleted_at"),
  isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const syncOutbox = sqliteTable("sync_outbox", {
  id: text("id").primaryKey(),
  tableName: text("table_name").notNull(),
  rowId: text("row_id").notNull(),
  operation: text("operation").notNull(),
  payload: text("payload"),
  scopeId: text("scope_id").notNull(),
  changedAt: text("changed_at").notNull(),
  syncedAt: text("synced_at"),
});

export const syncCursors = sqliteTable("sync_cursors", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  scopeId: text("scope_id").notNull(),
  lastCursor: text("last_cursor").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
});

export const syncedCategories = syncedTable(categories, {
  scope: "merchant_id",
  localOnlyColumns: ["isSynced"],
});
export const syncedProducts = syncedTable(products, {
  scope: "merchant_id",
  localOnlyColumns: ["isSynced"],
});

export const syncContract = syncSchema({
  packageName: fixturePackageName,
  tables: [syncedCategories, syncedProducts],
});

export const fixtureOrder = {
  upsert: ["categories", "products"] as const,
  delete: ["products", "categories"] as const,
};

export const fixtureDb = createTauriDrizzleDatabase({
  schema: {
    categories,
    products,
    syncOutbox,
    syncCursors,
  },
  invoke: invoke as unknown as InvokeFn,
});

export interface FixtureRuntimeConfig {
  api_url: string;
  encoding: FixtureTransportMode;
}

export async function getFixtureRuntimeConfig() {
  return (await invoke("get_fixture_runtime_config")) as FixtureRuntimeConfig;
}

export function createFixtureSyncClient(config: FixtureRuntimeConfig) {
  return createSyncClient({
    encoding: config.encoding,
    scopeId: fixtureScopeId,
    invoke: invoke as unknown as InvokeFn,
  });
}

export function latestRowsQuery() {
  return {
    categories: fixtureDb
      .select()
      .from(categories)
      .orderBy(desc(categories.updatedAt)),
    products: fixtureDb
      .select()
      .from(products)
      .orderBy(desc(products.updatedAt)),
  };
}

export function statusQuery() {
  return fixtureDb.select().from(syncOutbox);
}

export interface FixtureRowInsert {
  categoryId: string;
  categoryName: string;
  priceMinorUnits: number;
  productId: string;
  productName: string;
  timestamp: string;
}
