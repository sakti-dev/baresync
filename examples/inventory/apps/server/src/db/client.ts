import { Database } from "bun:sqlite";
import fs from "node:fs/promises";
import path from "node:path";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

const DEFAULT_DB_PATH = "./data/inventory-server.db";

export interface InventoryDatabaseHandle {
  db: BunSQLiteDatabase<Record<string, never>>;
  dbPath: string;
}

export async function createInventoryDatabase(): Promise<InventoryDatabaseHandle> {
  const dbPath = path.resolve(
    process.cwd(),
    process.env.INVENTORY_SERVER_DB_PATH ?? DEFAULT_DB_PATH
  );
  await fs.mkdir(path.dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");

  const db = drizzle(sqlite);
  migrate(db, {
    migrationsFolder: path.resolve(process.cwd(), "drizzle"),
  });

  return { db, dbPath };
}
