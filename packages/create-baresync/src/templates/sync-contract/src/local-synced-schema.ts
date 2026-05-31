import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { localSyncColumns } from "baresync/schema";

export const lists = sqliteTable("lists", {
  id: text("id").primaryKey(),
  scopeId: text("scope_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  ...localSyncColumns(),
});

export const todos = sqliteTable("todos", {
  id: text("id").primaryKey(),
  scopeId: text("scope_id").notNull(),
  listId: text("list_id")
    .notNull()
    .references(() => lists.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  notes: text("notes"),
  ...localSyncColumns(),
});
