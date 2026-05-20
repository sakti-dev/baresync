import {
  formatSyncCursor,
  parseSyncCursor,
  type SyncPushChange,
} from "baresync/server";
import { and, desc, eq, gt, type InferSelectModel } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { items, locations, stockCounts } from "./schema";
import { getSeedCursor, seedInventoryDatabase } from "./seed";

export interface InventoryScope {
  scopeId: string;
}

export interface InventoryPullTable {
  changedRows: Record<string, unknown>[];
  deletedIds: string[];
  table: string;
}

export interface InventoryPullResponse {
  cursor: string;
  hasMore: boolean;
  serverTime: string;
  tables: InventoryPullTable[];
}

export interface InventoryStatusResponse {
  changedTables: string[];
  cursor: string;
  hasChanges: boolean;
  serverTime: string;
}

type InventoryDb = BunSQLiteDatabase<Record<string, never>>;
type LocationRow = InferSelectModel<typeof locations>;
type ItemRow = InferSelectModel<typeof items>;
type StockCountRow = InferSelectModel<typeof stockCounts>;
type TableName = "locations" | "items" | "stock_counts";

const TABLE_NAMES = ["locations", "items", "stock_counts"] as const;

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

function asRow(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
}

function stripSyncUpdatedAt<Row extends { syncUpdatedAt: number }>(
  row: Row
): Omit<Row, "syncUpdatedAt"> {
  const { syncUpdatedAt: _syncUpdatedAt, ...publicRow } = row;
  return publicRow;
}

function splitRows<
  Row extends {
    deletedAt: string | null;
    id: string;
    syncUpdatedAt: number;
  },
>(
  rows: Row[]
): { changedRows: Omit<Row, "syncUpdatedAt">[]; deletedIds: string[] } {
  const changedRows: Omit<Row, "syncUpdatedAt">[] = [];
  const deletedIds: string[] = [];

  for (const row of rows) {
    if (row.deletedAt === null) {
      changedRows.push(stripSyncUpdatedAt(row));
      continue;
    }

    deletedIds.push(row.id);
  }

  return { changedRows, deletedIds };
}

function parseCursorTimestamp(cursor: string): number {
  const parsed = cursor ? parseSyncCursor(cursor) : null;
  return parsed?.syncUpdatedAt ?? 0;
}

function formatCursor(row: {
  id: string;
  syncUpdatedAt: number;
  tableName: TableName;
}): string {
  return formatSyncCursor({
    rowId: row.id,
    syncUpdatedAt: row.syncUpdatedAt,
    tableName: row.tableName,
  });
}

function compareCursorRows(
  left: { id: string; syncUpdatedAt: number; updatedAt: string },
  right: { id: string; syncUpdatedAt: number; updatedAt: string }
): number {
  if (left.syncUpdatedAt !== right.syncUpdatedAt) {
    return left.syncUpdatedAt - right.syncUpdatedAt;
  }

  if (left.updatedAt !== right.updatedAt) {
    return left.updatedAt.localeCompare(right.updatedAt);
  }

  return left.id.localeCompare(right.id);
}

function buildLocationRow(input: {
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

function buildItemRow(input: {
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

function buildStockCountRow(input: {
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

function readLocations(
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

function readItems(
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

function readStockCounts(
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

async function readLatestCursorRow(
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

  return candidates.reduce((best, row) =>
    compareCursorRows(row, best) > 0 ? row : best
  );
}

async function snapshotTables(db: InventoryDb, scopeId: string) {
  const [locationRows, itemRows, stockCountRows] = await Promise.all([
    readLocations(db, scopeId),
    readItems(db, scopeId),
    readStockCounts(db, scopeId),
  ]);

  return {
    locations: splitRows(locationRows),
    items: splitRows(itemRows),
    stockCounts: splitRows(stockCountRows),
  };
}

async function tableChangesSince(
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
    locations: splitRows(locationRows),
    items: splitRows(itemRows),
    stockCounts: splitRows(stockCountRows),
  };
}

function toPullTables(
  tableEntries: [
    TableName,
    { changedRows: Record<string, unknown>[]; deletedIds: string[] },
  ][],
  requestedTables: readonly string[]
): InventoryPullTable[] {
  const requested =
    requestedTables.length > 0 ? requestedTables : [...TABLE_NAMES];

  return requested.map((table) => {
    const entry = tableEntries.find(([name]) => name === table);
    return {
      changedRows: entry?.[1].changedRows ?? [],
      deletedIds: entry?.[1].deletedIds ?? [],
      table,
    };
  });
}

async function buildSnapshotResponse(
  db: InventoryDb,
  scopeId: string,
  serverTime: string
): Promise<InventoryPullResponse> {
  const snapshot = await snapshotTables(db, scopeId);
  const latestRow = await readLatestCursorRow(db, scopeId);

  return {
    cursor: formatCursor(latestRow ?? getSeedCursor()),
    hasMore: false,
    serverTime,
    tables: toPullTables(
      [
        ["locations", snapshot.locations],
        ["items", snapshot.items],
        ["stock_counts", snapshot.stockCounts],
      ],
      TABLE_NAMES
    ),
  };
}

async function writePushChange(
  tx: InventoryDb,
  input: {
    change: SyncPushChange;
    scopeId: string;
    syncUpdatedAt: number;
  }
) {
  const updatedAt = new Date(input.syncUpdatedAt).toISOString();

  const tableName = input.change.table as TableName;

  switch (tableName) {
    case "locations": {
      for (const row of input.change.changedRows) {
        const nextRow = buildLocationRow({
          row: { ...asRow(row), updatedAt },
          scopeId: input.scopeId,
          syncUpdatedAt: input.syncUpdatedAt,
          updatedAt,
        });

        const { id: _id, ...setValues } = nextRow;
        await tx.insert(locations).values(nextRow).onConflictDoUpdate({
          target: locations.id,
          set: setValues,
        });
      }

      for (const id of input.change.deletedIds) {
        await tx
          .update(locations)
          .set({
            deletedAt: updatedAt,
            syncUpdatedAt: input.syncUpdatedAt,
            updatedAt,
          })
          .where(eq(locations.id, id));
      }
      return;
    }
    case "items": {
      for (const row of input.change.changedRows) {
        const nextRow = buildItemRow({
          row: { ...asRow(row), updatedAt },
          scopeId: input.scopeId,
          syncUpdatedAt: input.syncUpdatedAt,
          updatedAt,
        });

        const { id: _id, ...setValues } = nextRow;
        await tx.insert(items).values(nextRow).onConflictDoUpdate({
          target: items.id,
          set: setValues,
        });
      }

      for (const id of input.change.deletedIds) {
        await tx
          .update(items)
          .set({
            deletedAt: updatedAt,
            syncUpdatedAt: input.syncUpdatedAt,
            updatedAt,
          })
          .where(eq(items.id, id));
      }
      return;
    }
    case "stock_counts": {
      for (const row of input.change.changedRows) {
        const nextRow = buildStockCountRow({
          row: { ...asRow(row), updatedAt },
          scopeId: input.scopeId,
          syncUpdatedAt: input.syncUpdatedAt,
          updatedAt,
        });

        const { id: _id, ...setValues } = nextRow;
        await tx.insert(stockCounts).values(nextRow).onConflictDoUpdate({
          target: stockCounts.id,
          set: setValues,
        });
      }

      for (const id of input.change.deletedIds) {
        await tx
          .update(stockCounts)
          .set({
            deletedAt: updatedAt,
            syncUpdatedAt: input.syncUpdatedAt,
            updatedAt,
          })
          .where(eq(stockCounts.id, id));
      }
      return;
    }
    default: {
      throw new Error(`Unsupported inventory table: ${tableName}`);
    }
  }
}

export function createInventoryRepository(db: InventoryDb) {
  return {
    async applyPushChanges(input: {
      changes: readonly SyncPushChange[];
      scopeId: string;
      syncUpdatedAt: number;
    }): Promise<InventoryPullResponse> {
      const serverTime = nowIso();

      await db.transaction(async (tx) => {
        for (const change of input.changes) {
          await writePushChange(tx, {
            change,
            scopeId: input.scopeId,
            syncUpdatedAt: input.syncUpdatedAt,
          });
        }
      });

      return buildSnapshotResponse(db, input.scopeId, serverTime);
    },

    async loadPullChanges(input: {
      cursor: string;
      scopeId: string;
      tables: readonly string[];
    }): Promise<InventoryPullResponse> {
      const cursorTimestamp = parseCursorTimestamp(input.cursor);
      const changes = await tableChangesSince(
        db,
        input.scopeId,
        cursorTimestamp
      );
      const latestRow = await readLatestCursorRow(db, input.scopeId);

      return {
        cursor: formatCursor(latestRow ?? getSeedCursor()),
        hasMore: false,
        serverTime: nowIso(),
        tables: toPullTables(
          [
            ["locations", changes.locations],
            ["items", changes.items],
            ["stock_counts", changes.stockCounts],
          ],
          input.tables
        ),
      };
    },

    async loadSyncStatus(input: {
      cursor: string;
      scopeId: string;
    }): Promise<InventoryStatusResponse> {
      const cursorTimestamp = parseCursorTimestamp(input.cursor);
      const changes = await tableChangesSince(
        db,
        input.scopeId,
        cursorTimestamp
      );
      const latestRow = await readLatestCursorRow(db, input.scopeId);

      const changedTables = TABLE_NAMES.filter((table) => {
        let tableChanges:
          | { changedRows: Record<string, unknown>[]; deletedIds: string[] }
          | undefined;

        if (table === "locations") {
          tableChanges = changes.locations;
        } else if (table === "items") {
          tableChanges = changes.items;
        } else {
          tableChanges = changes.stockCounts;
        }

        return (
          tableChanges.changedRows.length > 0 ||
          tableChanges.deletedIds.length > 0
        );
      });

      return {
        changedTables,
        hasChanges: changedTables.length > 0,
        cursor: formatCursor(latestRow ?? getSeedCursor()),
        serverTime: nowIso(),
      };
    },

    async seedIfNeeded(): Promise<void> {
      await seedInventoryDatabase(db);
    },
  };
}
