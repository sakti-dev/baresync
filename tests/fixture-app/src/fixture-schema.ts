import { invoke } from "@tauri-apps/api/core";
import { createTauriDrizzleDatabase } from "baresync/db";
import { createSyncClient } from "baresync/tauri";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const fixtureScopeId = "merchant-1";

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

const syncOutbox = sqliteTable("sync_outbox", {
  id: text("id").primaryKey(),
  tableName: text("table_name").notNull(),
  rowId: text("row_id").notNull(),
  operation: text("operation").notNull(),
  payload: text("payload"),
  scopeId: text("scope_id").notNull(),
  changedAt: text("changed_at").notNull(),
  syncedAt: text("synced_at"),
});

const syncCursors = sqliteTable("sync_cursors", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  scopeId: text("scope_id").notNull(),
  lastCursor: text("last_cursor").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
});

export const fixtureDb = createTauriDrizzleDatabase({
  schema: {
    categories,
    products,
    syncOutbox,
    syncCursors,
  },
  invoke,
});

export interface FixtureRuntimeConfig {
  api_url: string;
  auth_token: string | null;
}

export async function getFixtureRuntimeConfig() {
  return (await invoke("get_fixture_runtime_config")) as FixtureRuntimeConfig;
}

export function createFixtureSyncClient(_config: FixtureRuntimeConfig) {
  return createSyncClient({
    scopeId: fixtureScopeId,
    invoke,
  });
}

export interface FixtureRowInsert {
  categoryId: string;
  categoryName: string;
  priceMinorUnits: number;
  productId: string;
  productName: string;
  timestamp: string;
}
