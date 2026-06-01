import { Database } from "bun:sqlite";
import fs from "node:fs/promises";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";

const dbPath = path.resolve(
  process.cwd(),
  process.env.INVENTORY_SERVER_DB_PATH ?? "./data/inventory-server.db"
);

await fs.mkdir(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.run("PRAGMA journal_mode = WAL");
sqlite.run("PRAGMA foreign_keys = ON");

export const db = drizzle(sqlite);
