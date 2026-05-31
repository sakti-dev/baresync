import {
  items,
  locations,
  stockCounts,
} from "@examples/sync-contract/generated/2026-05-31/api-synced-schema";
import {
  createDrizzleSyncRepository,
  type DrizzleSyncReadRow,
  optionalString,
  requiredNumber,
  requiredString,
} from "baresync/server/drizzle";
import { and, desc, eq, gt, type InferInsertModel } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

type InventoryDb = BunSQLiteDatabase<Record<string, never>>;
type TableName = "locations" | "items" | "stock_counts";

export interface InventoryScope {
  scopeId: string;
}

export interface InventoryPullTable {
  changedRows: Record<string, unknown>[];
  deletedIds: string[];
  table: TableName;
}

export interface InventoryPullResponse {
  cursor: string;
  hasMore: boolean;
  serverTime: string;
  tables: InventoryPullTable[];
}

export interface InventoryStatusResponse {
  changedTables: TableName[];
  cursor: string;
  hasChanges: boolean;
  serverTime: string;
}

export function createInventorySyncRepository(db: InventoryDb) {
  const repository = createDrizzleSyncRepository({
    tables: {
      locations: {
        buildRow: ({ row, scopeId, syncUpdatedAt, updatedAt }) => ({
          createdAt: optionalString(row.createdAt) ?? updatedAt,
          deletedAt: optionalString(row.deletedAt),
          id: requiredString(row.id, "locations.id"),
          name: requiredString(row.name, "locations.name"),
          scopeId,
          syncUpdatedAt,
          updatedAt,
        }),
        readLatestRow: async ({ scopeId }) => {
          const rows = await db
            .select()
            .from(locations)
            .where(eq(locations.scopeId, scopeId))
            .orderBy(
              desc(locations.syncUpdatedAt),
              desc(locations.updatedAt),
              desc(locations.id)
            )
            .limit(1);
          return rows[0] ?? null;
        },
        readRows: ({ cursorTimestamp, scopeId }) =>
          db
            .select()
            .from(locations)
            .where(
              cursorTimestamp > 0
                ? and(
                    eq(locations.scopeId, scopeId),
                    gt(locations.syncUpdatedAt, cursorTimestamp)
                  )
                : eq(locations.scopeId, scopeId)
            )
            .orderBy(
              desc(locations.syncUpdatedAt),
              desc(locations.updatedAt),
              desc(locations.id)
            ) as Promise<readonly DrizzleSyncReadRow[]>,
        softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
          await db
            .update(locations)
            .set({
              deletedAt: updatedAt,
              syncUpdatedAt,
              updatedAt,
            })
            .where(eq(locations.id, id));
        },
        upsertRow: async (row: InferInsertModel<typeof locations>) => {
          const { id: _id, ...setValues } = row;
          await db.insert(locations).values(row).onConflictDoUpdate({
            target: locations.id,
            set: setValues,
          });
        },
      },
      items: {
        buildRow: ({ row, scopeId, syncUpdatedAt, updatedAt }) => ({
          createdAt: optionalString(row.createdAt) ?? updatedAt,
          deletedAt: optionalString(row.deletedAt),
          id: requiredString(row.id, "items.id"),
          locationId: requiredString(row.locationId, "items.locationId"),
          name: requiredString(row.name, "items.name"),
          scopeId,
          sku: optionalString(row.sku),
          syncUpdatedAt,
          updatedAt,
        }),
        readLatestRow: async ({ scopeId }) => {
          const rows = await db
            .select()
            .from(items)
            .where(eq(items.scopeId, scopeId))
            .orderBy(
              desc(items.syncUpdatedAt),
              desc(items.updatedAt),
              desc(items.id)
            )
            .limit(1);
          return rows[0] ?? null;
        },
        readRows: ({ cursorTimestamp, scopeId }) =>
          db
            .select()
            .from(items)
            .where(
              cursorTimestamp > 0
                ? and(
                    eq(items.scopeId, scopeId),
                    gt(items.syncUpdatedAt, cursorTimestamp)
                  )
                : eq(items.scopeId, scopeId)
            )
            .orderBy(
              desc(items.syncUpdatedAt),
              desc(items.updatedAt),
              desc(items.id)
            ) as Promise<readonly DrizzleSyncReadRow[]>,
        softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
          await db
            .update(items)
            .set({
              deletedAt: updatedAt,
              syncUpdatedAt,
              updatedAt,
            })
            .where(eq(items.id, id));
        },
        upsertRow: async (row: InferInsertModel<typeof items>) => {
          const { id: _id, ...setValues } = row;
          await db.insert(items).values(row).onConflictDoUpdate({
            target: items.id,
            set: setValues,
          });
        },
      },
      stock_counts: {
        buildRow: ({ row, scopeId, syncUpdatedAt, updatedAt }) => ({
          countedQuantity: requiredNumber(
            row.countedQuantity,
            "stock_counts.countedQuantity"
          ),
          createdAt: optionalString(row.createdAt) ?? updatedAt,
          deletedAt: optionalString(row.deletedAt),
          id: requiredString(row.id, "stock_counts.id"),
          itemId: requiredString(row.itemId, "stock_counts.itemId"),
          recordedAt: optionalString(row.recordedAt) ?? updatedAt,
          scopeId,
          syncUpdatedAt,
          updatedAt,
        }),
        readLatestRow: async ({ scopeId }) => {
          const rows = await db
            .select()
            .from(stockCounts)
            .where(eq(stockCounts.scopeId, scopeId))
            .orderBy(
              desc(stockCounts.syncUpdatedAt),
              desc(stockCounts.updatedAt),
              desc(stockCounts.id)
            )
            .limit(1);
          return rows[0] ?? null;
        },
        readRows: ({ cursorTimestamp, scopeId }) =>
          db
            .select()
            .from(stockCounts)
            .where(
              cursorTimestamp > 0
                ? and(
                    eq(stockCounts.scopeId, scopeId),
                    gt(stockCounts.syncUpdatedAt, cursorTimestamp)
                  )
                : eq(stockCounts.scopeId, scopeId)
            )
            .orderBy(
              desc(stockCounts.syncUpdatedAt),
              desc(stockCounts.updatedAt),
              desc(stockCounts.id)
            ) as Promise<readonly DrizzleSyncReadRow[]>,
        softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
          await db
            .update(stockCounts)
            .set({
              deletedAt: updatedAt,
              syncUpdatedAt,
              updatedAt,
            })
            .where(eq(stockCounts.id, id));
        },
        upsertRow: async (row: InferInsertModel<typeof stockCounts>) => {
          const { id: _id, ...setValues } = row;
          await db.insert(stockCounts).values(row).onConflictDoUpdate({
            target: stockCounts.id,
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
