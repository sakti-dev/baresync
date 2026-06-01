import {
  items,
  locations,
  stockCounts,
} from "@sync-contract/generated/2026-06-01/api-synced-schema";
import { pickLatestSyncCursorRow } from "baresync/server";
import { and, desc, eq, gt, type InferSelectModel } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

export type InventoryDb = BunSQLiteDatabase<Record<string, never>>;
export type TableName = "locations" | "items" | "stock_counts";

export const TABLE_NAMES = ["locations", "items", "stock_counts"] as const;

type LocationRow = InferSelectModel<typeof locations>;
type ItemRow = InferSelectModel<typeof items>;
type StockCountRow = InferSelectModel<typeof stockCounts>;

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function asRow(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
}

export function buildInventoryChangeBucket<
  Row extends {
    deletedAt: string | null;
    id: string;
    syncUpdatedAt: number;
  },
>(
  rows: readonly Row[]
): {
  changedRows: Record<string, unknown>[];
  deletedIds: string[];
} {
  const changedRows: Record<string, unknown>[] = [];
  const deletedIds: string[] = [];

  for (const row of rows) {
    if (row.deletedAt === null) {
      const { syncUpdatedAt: _syncUpdatedAt, ...publicRow } = row;
      changedRows.push(asRow(publicRow));
      continue;
    }

    deletedIds.push(row.id);
  }

  return {
    changedRows,
    deletedIds,
  };
}

export function buildLocationRow(input: {
  scopeId: string;
  syncUpdatedAt: number;
  updatedAt: string;
  row: Record<string, unknown>;
}): LocationRow {
  const { row } = input;
  return {
    createdAt: normalizeString(row.createdAt, input.updatedAt),
    deletedAt: normalizeNullableString(row.deletedAt),
    id: normalizeString(row.id),
    name: normalizeString(row.name),
    scopeId: input.scopeId,
    syncUpdatedAt: input.syncUpdatedAt,
    updatedAt: input.updatedAt,
  };
}

export function buildItemRow(input: {
  scopeId: string;
  syncUpdatedAt: number;
  updatedAt: string;
  row: Record<string, unknown>;
}): ItemRow {
  const { row } = input;
  return {
    createdAt: normalizeString(row.createdAt, input.updatedAt),
    deletedAt: normalizeNullableString(row.deletedAt),
    id: normalizeString(row.id),
    locationId: normalizeString(row.locationId),
    name: normalizeString(row.name),
    scopeId: input.scopeId,
    sku: normalizeNullableString(row.sku),
    syncUpdatedAt: input.syncUpdatedAt,
    updatedAt: input.updatedAt,
  };
}

export function buildStockCountRow(input: {
  scopeId: string;
  syncUpdatedAt: number;
  updatedAt: string;
  row: Record<string, unknown>;
}): StockCountRow {
  const { row } = input;
  return {
    countedQuantity: normalizeNumber(row.countedQuantity),
    createdAt: normalizeString(row.createdAt, input.updatedAt),
    deletedAt: normalizeNullableString(row.deletedAt),
    id: normalizeString(row.id),
    itemId: normalizeString(row.itemId),
    recordedAt: normalizeString(row.recordedAt, input.updatedAt),
    scopeId: input.scopeId,
    syncUpdatedAt: input.syncUpdatedAt,
    updatedAt: input.updatedAt,
  };
}

export function readLocations(
  db: InventoryDb,
  scopeId: string,
  sinceSyncUpdatedAt?: number
) {
  return db
    .select()
    .from(locations)
    .where(
      sinceSyncUpdatedAt === undefined
        ? eq(locations.scopeId, scopeId)
        : and(
            eq(locations.scopeId, scopeId),
            gt(locations.syncUpdatedAt, sinceSyncUpdatedAt)
          )
    )
    .orderBy(desc(locations.syncUpdatedAt), desc(locations.updatedAt));
}

export function readItems(
  db: InventoryDb,
  scopeId: string,
  sinceSyncUpdatedAt?: number
) {
  return db
    .select()
    .from(items)
    .where(
      sinceSyncUpdatedAt === undefined
        ? eq(items.scopeId, scopeId)
        : and(
            eq(items.scopeId, scopeId),
            gt(items.syncUpdatedAt, sinceSyncUpdatedAt)
          )
    )
    .orderBy(desc(items.syncUpdatedAt), desc(items.updatedAt));
}

export function readStockCounts(
  db: InventoryDb,
  scopeId: string,
  sinceSyncUpdatedAt?: number
) {
  return db
    .select()
    .from(stockCounts)
    .where(
      sinceSyncUpdatedAt === undefined
        ? eq(stockCounts.scopeId, scopeId)
        : and(
            eq(stockCounts.scopeId, scopeId),
            gt(stockCounts.syncUpdatedAt, sinceSyncUpdatedAt)
          )
    )
    .orderBy(desc(stockCounts.syncUpdatedAt), desc(stockCounts.updatedAt));
}

export async function readLatestCursorRow(
  db: InventoryDb,
  scopeId: string
): Promise<{
  id: string;
  syncUpdatedAt: number;
  tableName: TableName;
  updatedAt: string;
} | null> {
  const [locationRows, itemRows, stockCountRows] = await Promise.all([
    db
      .select({
        id: locations.id,
        syncUpdatedAt: locations.syncUpdatedAt,
        updatedAt: locations.updatedAt,
      })
      .from(locations)
      .where(eq(locations.scopeId, scopeId))
      .orderBy(
        desc(locations.syncUpdatedAt),
        desc(locations.updatedAt),
        desc(locations.id)
      )
      .limit(1),
    db
      .select({
        id: items.id,
        syncUpdatedAt: items.syncUpdatedAt,
        updatedAt: items.updatedAt,
      })
      .from(items)
      .where(eq(items.scopeId, scopeId))
      .orderBy(desc(items.syncUpdatedAt), desc(items.updatedAt), desc(items.id))
      .limit(1),
    db
      .select({
        id: stockCounts.id,
        syncUpdatedAt: stockCounts.syncUpdatedAt,
        updatedAt: stockCounts.updatedAt,
      })
      .from(stockCounts)
      .where(eq(stockCounts.scopeId, scopeId))
      .orderBy(
        desc(stockCounts.syncUpdatedAt),
        desc(stockCounts.updatedAt),
        desc(stockCounts.id)
      )
      .limit(1),
  ]);

  const candidates: {
    id: string;
    syncUpdatedAt: number;
    tableName: TableName;
    updatedAt: string;
  }[] = [];

  if (locationRows[0]) {
    candidates.push({ ...locationRows[0], tableName: "locations" });
  }
  if (itemRows[0]) {
    candidates.push({ ...itemRows[0], tableName: "items" });
  }
  if (stockCountRows[0]) {
    candidates.push({ ...stockCountRows[0], tableName: "stock_counts" });
  }

  if (candidates.length === 0) {
    return null;
  }

  return pickLatestSyncCursorRow(candidates);
}

export async function snapshotTables(db: InventoryDb, scopeId: string) {
  const [locationRows, itemRows, stockCountRows] = await Promise.all([
    readLocations(db, scopeId),
    readItems(db, scopeId),
    readStockCounts(db, scopeId),
  ]);

  return {
    locations: buildInventoryChangeBucket(locationRows),
    items: buildInventoryChangeBucket(itemRows),
    stockCounts: buildInventoryChangeBucket(stockCountRows),
  };
}

export async function tableChangesSince(
  db: InventoryDb,
  scopeId: string,
  cursorTimestamp: number
) {
  const [locationRows, itemRows, stockCountRows] = await Promise.all([
    readLocations(db, scopeId, cursorTimestamp),
    readItems(db, scopeId, cursorTimestamp),
    readStockCounts(db, scopeId, cursorTimestamp),
  ]);

  return {
    locations: buildInventoryChangeBucket(locationRows),
    items: buildInventoryChangeBucket(itemRows),
    stockCounts: buildInventoryChangeBucket(stockCountRows),
  };
}

export { nowIso };
