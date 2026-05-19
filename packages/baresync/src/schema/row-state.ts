import { integer, text } from "drizzle-orm/sqlite-core";

export const localSyncRowState = {
  deletedAt: text("deleted_at"),
  isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
};

export const apiSyncRowState = {
  deletedAt: text("deleted_at"),
  syncUpdatedAt: integer("sync_updated_at", { mode: "number" }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};
