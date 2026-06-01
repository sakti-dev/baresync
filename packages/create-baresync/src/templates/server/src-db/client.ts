import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

const dbPath = path.resolve(
  process.cwd(),
  process.env.__PROJECT_NAME___SERVER_DB_PATH ?? "./data/__PROJECT_NAME__-server.db"
);

await fs.mkdir(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite);
