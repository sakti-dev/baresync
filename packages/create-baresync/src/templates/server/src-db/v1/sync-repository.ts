import { lists, todos } from "@sync-contract/generated/__CONTRACT_DATE__/api-synced-schema";
import {
  createDrizzleSyncRepository,
  optionalString,
  requiredString,
} from "baresync/server/drizzle";
import { and, desc, eq, gt, type InferInsertModel } from "drizzle-orm";
import { db } from "../client";

export const repository = createDrizzleSyncRepository({
  // db enables batched execution (one driver call per sync operation) on
  // dialects whose driver exposes `db.batch`.
  db,
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
      readLatestRow: ({ scopeId }: { scopeId: string }) =>
        db
          .select()
          .from(lists)
          .where(eq(lists.scopeId, scopeId))
          .orderBy(
            desc(lists.syncUpdatedAt),
            desc(lists.updatedAt),
            desc(lists.id)
          )
          .limit(1),
      readRows: ({ cursorTimestamp, scopeId }: { cursorTimestamp: number; scopeId: string }) =>
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
          ),
      softDeleteRow: ({ id, syncUpdatedAt, updatedAt }: { id: string; syncUpdatedAt: number; updatedAt: string }) =>
        db
          .update(lists)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(lists.id, id)),
      upsertRow: (row: InferInsertModel<typeof lists>) => {
        const { id: _id, ...setValues } = row;
        return db.insert(lists).values(row).onConflictDoUpdate({
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
      readLatestRow: ({ scopeId }: { scopeId: string }) =>
        db
          .select()
          .from(todos)
          .where(eq(todos.scopeId, scopeId))
          .orderBy(
            desc(todos.syncUpdatedAt),
            desc(todos.updatedAt),
            desc(todos.id)
          )
          .limit(1),
      readRows: ({ cursorTimestamp, scopeId }: { cursorTimestamp: number; scopeId: string }) =>
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
          ),
      softDeleteRow: ({ id, syncUpdatedAt, updatedAt }: { id: string; syncUpdatedAt: number; updatedAt: string }) =>
        db
          .update(todos)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(todos.id, id)),
      upsertRow: (row: InferInsertModel<typeof todos>) => {
        const { id: _id, ...setValues } = row;
        return db.insert(todos).values(row).onConflictDoUpdate({
          target: todos.id,
          set: setValues,
        });
      },
    },
  },
});
