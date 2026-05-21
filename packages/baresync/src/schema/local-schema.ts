import { sql } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export function createSyncOutboxTable() {
  return sqliteTable(
    "sync_outbox",
    {
      id: text("id")
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
      tableName: text("table_name").notNull(),
      rowId: text("row_id").notNull(),
      operation: text("operation", {
        enum: ["insert", "update", "delete"],
      }).notNull(),
      payload: text("payload"),
      scopeId: text("scope_id").notNull(),
      changedAt: text("changed_at")
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
      syncedAt: text("synced_at"),
    },
    (table) => [
      uniqueIndex("sync_outbox_pending_row_unique")
        .on(table.tableName, table.rowId)
        .where(sql`${table.syncedAt} IS NULL`),
    ]
  );
}

export function createSyncCursorsTable() {
  return sqliteTable("sync_cursors", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    scopeId: text("scope_id").notNull(),
    lastCursor: text("last_cursor").notNull().default(""),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  });
}

export const syncOutbox = createSyncOutboxTable();
export const syncCursors = createSyncCursorsTable();

export const syncLocalSchema = {
  syncCursors,
  syncOutbox,
};
