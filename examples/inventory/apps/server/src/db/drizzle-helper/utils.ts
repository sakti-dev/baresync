import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

export type InventoryDb = BunSQLiteDatabase<Record<string, never>>;
export type TableName = "locations" | "items" | "stock_counts";

export const TABLE_NAMES = ["locations", "items", "stock_counts"] as const;
