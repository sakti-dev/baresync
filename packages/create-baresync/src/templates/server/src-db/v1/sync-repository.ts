import { lists, todos } from "@sync-contract/generated/__CONTRACT_DATE__/api-synced-schema";
import {
  createDrizzleSyncRepository,
  type DrizzleSyncReadRow,
  optionalString,
  requiredString,
} from "baresync/server/drizzle";
import { and, desc, eq, gt, type InferInsertModel } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

type AppDb = BetterSQLite3Database<Record<string, never>>;

export interface AppScope {
  scopeId: string;
}

export function createAppSyncRepository(db: AppDb) {
  const repository = createDrizzleSyncRepository({
    tables: {
      lists: {
        buildRow: ({ row, scopeId, syncUpdatedAt, updatedAt }) => ({
          createdAt: optionalString(row.createdAt) ?? updatedAt,
          deletedAt: optionalString(row.deletedAt),
          id: requiredString(row.id, "lists.id"),
          name: requiredString(row.name, "lists.name"),
          description: optionalString(row.description),
          scopeId,
          syncUpdatedAt,
          updatedAt,
        }),
        readLatestRow: async ({ scopeId }) => {
          const rows = await db
            .select()
            .from(lists)
            .where(eq(lists.scopeId, scopeId))
            .orderBy(
              desc(lists.syncUpdatedAt),
              desc(lists.updatedAt),
              desc(lists.id)
            )
            .limit(1);
          return rows[0] ?? null;
        },
        readRows: ({ cursorTimestamp, scopeId }) =>
          db
            .select()
            .from(lists)
            .where(
              cursorTimestamp > 0
                ? and(
                    eq(lists.scopeId, scopeId),
                    gt(lists.syncUpdatedAt, cursorTimestamp)
                  )
                : eq(lists.scopeId, scopeId)
            )
            .orderBy(
              desc(lists.syncUpdatedAt),
              desc(lists.updatedAt),
              desc(lists.id)
            ) as Promise<readonly DrizzleSyncReadRow[]>,
        softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
          await db
            .update(lists)
            .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
            .where(eq(lists.id, id));
        },
        upsertRow: async (row: InferInsertModel<typeof lists>) => {
          const { id: _id, ...setValues } = row;
          await db.insert(lists).values(row).onConflictDoUpdate({
            target: lists.id,
            set: setValues,
          });
        },
      },
      todos: {
        buildRow: ({ row, scopeId, syncUpdatedAt, updatedAt }) => ({
          createdAt: optionalString(row.createdAt) ?? updatedAt,
          deletedAt: optionalString(row.deletedAt),
          id: requiredString(row.id, "todos.id"),
          listId: requiredString(row.listId, "todos.listId"),
          title: requiredString(row.title, "todos.title"),
          notes: optionalString(row.notes),
          scopeId,
          syncUpdatedAt,
          updatedAt,
        }),
        readLatestRow: async ({ scopeId }) => {
          const rows = await db
            .select()
            .from(todos)
            .where(eq(todos.scopeId, scopeId))
            .orderBy(
              desc(todos.syncUpdatedAt),
              desc(todos.updatedAt),
              desc(todos.id)
            )
            .limit(1);
          return rows[0] ?? null;
        },
        readRows: ({ cursorTimestamp, scopeId }) =>
          db
            .select()
            .from(todos)
            .where(
              cursorTimestamp > 0
                ? and(
                    eq(todos.scopeId, scopeId),
                    gt(todos.syncUpdatedAt, cursorTimestamp)
                  )
                : eq(todos.scopeId, scopeId)
            )
            .orderBy(
              desc(todos.syncUpdatedAt),
              desc(todos.updatedAt),
              desc(todos.id)
            ) as Promise<readonly DrizzleSyncReadRow[]>,
        softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
          await db
            .update(todos)
            .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
            .where(eq(todos.id, id));
        },
        upsertRow: async (row: InferInsertModel<typeof todos>) => {
          const { id: _id, ...setValues } = row;
          await db.insert(todos).values(row).onConflictDoUpdate({
            target: todos.id,
            set: setValues,
          });
        },
      },
    },
  });

  return {
    tableNames: repository.tableNames,
    applyPushChanges: repository.applyPushChanges,
    loadPullChanges: repository.loadPullChanges,
    loadSyncStatus: repository.loadSyncStatus,
  };
}
