import {
  items,
  locations,
  stockCounts,
} from "@sync-contract/generated/2026-06-01/api-synced-schema";
import {
  buildPullTables,
  changedTableNames,
  formatLatestSyncCursor,
  parseSyncCursorTimestamp,
  type SyncPushChange,
  validateSyncTable,
} from "baresync/server";
import { eq } from "drizzle-orm";
import { getSeedCursor } from "../../seed";
import {
  asRow,
  buildItemRow,
  buildLocationRow,
  buildStockCountRow,
  type InventoryDb,
  nowIso,
  readLatestCursorRow,
  snapshotTables,
  TABLE_NAMES,
  type TableName,
  tableChangesSince,
} from "./utils";

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

async function buildSnapshotResponse(
  db: InventoryDb,
  scopeId: string,
  serverTime: string
): Promise<InventoryPullResponse> {
  const snapshot = await snapshotTables(db, scopeId);
  const latestRow = await readLatestCursorRow(db, scopeId);

  return {
    cursor: formatLatestSyncCursor(latestRow ?? getSeedCursor()),
    hasMore: false,
    serverTime,
    tables: buildPullTables({
      allTables: TABLE_NAMES,
      changes: {
        items: snapshot.items,
        locations: snapshot.locations,
        stock_counts: snapshot.stockCounts,
      },
      requestedTables: [],
    }),
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

  const tableName = validateSyncTable(input.change.table, TABLE_NAMES);

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

export function createInventorySyncRepository(db: InventoryDb) {
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
      const cursorTimestamp = parseSyncCursorTimestamp(input.cursor);
      const changes = await tableChangesSince(
        db,
        input.scopeId,
        cursorTimestamp
      );
      const latestRow = await readLatestCursorRow(db, input.scopeId);

      return {
        cursor: formatLatestSyncCursor(latestRow ?? getSeedCursor()),
        hasMore: false,
        serverTime: nowIso(),
        tables: buildPullTables({
          allTables: TABLE_NAMES,
          changes: {
            items: changes.items,
            locations: changes.locations,
            stock_counts: changes.stockCounts,
          },
          requestedTables: input.tables,
        }),
      };
    },

    async loadSyncStatus(input: {
      cursor: string;
      scopeId: string;
    }): Promise<InventoryStatusResponse> {
      const cursorTimestamp = parseSyncCursorTimestamp(input.cursor);
      const changes = await tableChangesSince(
        db,
        input.scopeId,
        cursorTimestamp
      );
      const latestRow = await readLatestCursorRow(db, input.scopeId);

      const changedTables = changedTableNames({
        allTables: TABLE_NAMES,
        changes: {
          items: changes.items,
          locations: changes.locations,
          stock_counts: changes.stockCounts,
        },
      });

      return {
        changedTables,
        hasChanges: changedTables.length > 0,
        cursor: formatLatestSyncCursor(latestRow ?? getSeedCursor()),
        serverTime: nowIso(),
      };
    },
  };
}
