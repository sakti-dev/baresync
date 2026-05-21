import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import {
  items,
  locations,
  stockCounts,
} from "@example/inventory-sync-contract/api-synced-schema";
import { formatLatestSyncCursor, type SyncPushChange } from "baresync/server";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { createInventorySyncRepository } from "../sync-repository";
import type { InventoryDb } from "../utils";

const PUSH_TIME = "2026-05-20T00:00:07.000Z";
const PUSH_SYNC_UPDATED_AT = Date.parse(PUSH_TIME);
const SCOPE_ID = "default";

function hasSyncUpdatedAt(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.hasOwn(value, "syncUpdatedAt")
  );
}

async function createTestDb(): Promise<InventoryDb> {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");

  const migrationSql = await readFile(
    new URL("../../../../drizzle/0000_initial_inventory.sql", import.meta.url),
    "utf8"
  );

  for (const statement of migrationSql.split("--> statement-breakpoint")) {
    const trimmed = statement.trim();
    if (trimmed.length > 0) {
      sqlite.exec(trimmed);
    }
  }

  return drizzle(sqlite) as unknown as InventoryDb;
}

async function seedInventoryRows(db: InventoryDb): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(locations).values([
      {
        createdAt: "2026-05-20T00:00:01.000Z",
        deletedAt: null,
        id: "loc-front",
        name: "Front Warehouse",
        scopeId: SCOPE_ID,
        syncUpdatedAt: 1000,
        updatedAt: "2026-05-20T00:00:01.000Z",
      },
      {
        createdAt: "2026-05-20T00:00:02.000Z",
        deletedAt: "2026-05-20T00:00:02.000Z",
        id: "loc-deleted",
        name: "Closed Warehouse",
        scopeId: SCOPE_ID,
        syncUpdatedAt: 2000,
        updatedAt: "2026-05-20T00:00:02.000Z",
      },
    ]);

    await tx.insert(items).values([
      {
        createdAt: "2026-05-20T00:00:03.000Z",
        deletedAt: null,
        id: "item-drill",
        locationId: "loc-front",
        name: "Cordless Drill",
        scopeId: SCOPE_ID,
        sku: "DRILL-01",
        syncUpdatedAt: 3000,
        updatedAt: "2026-05-20T00:00:03.000Z",
      },
      {
        createdAt: "2026-05-20T00:00:04.000Z",
        deletedAt: "2026-05-20T00:00:04.000Z",
        id: "item-deleted",
        locationId: "loc-front",
        name: "Retired Item",
        scopeId: SCOPE_ID,
        sku: null,
        syncUpdatedAt: 4000,
        updatedAt: "2026-05-20T00:00:04.000Z",
      },
    ]);

    await tx.insert(stockCounts).values([
      {
        countedQuantity: 4,
        createdAt: "2026-05-20T00:00:05.000Z",
        deletedAt: null,
        id: "count-drill",
        itemId: "item-drill",
        recordedAt: "2026-05-20T00:00:05.000Z",
        scopeId: SCOPE_ID,
        syncUpdatedAt: 5000,
        updatedAt: "2026-05-20T00:00:05.000Z",
      },
      {
        countedQuantity: 1,
        createdAt: "2026-05-20T00:00:06.000Z",
        deletedAt: "2026-05-20T00:00:06.000Z",
        id: "count-deleted",
        itemId: "item-drill",
        recordedAt: "2026-05-20T00:00:06.000Z",
        scopeId: SCOPE_ID,
        syncUpdatedAt: 6000,
        updatedAt: "2026-05-20T00:00:06.000Z",
      },
    ]);
  });
}

describe("simulation: inventory drizzle-helper repository flow", () => {
  it("runs the helper-backed repository end to end", async () => {
    const db = await createTestDb();
    await seedInventoryRows(db);

    const repository = createInventorySyncRepository(db);

    expect(repository.tableNames).toEqual([
      "locations",
      "items",
      "stock_counts",
    ]);

    const initialStatus = await repository.loadSyncStatus({
      cursor: "",
      scopeId: SCOPE_ID,
    });

    expect(initialStatus.changedTables).toEqual([
      "locations",
      "items",
      "stock_counts",
    ]);
    expect(initialStatus.hasChanges).toBe(true);
    expect(initialStatus.cursor).toBe(
      formatLatestSyncCursor({
        id: "count-deleted",
        syncUpdatedAt: 6000,
        tableName: "stock_counts",
      })
    );

    const initialPull = await repository.loadPullChanges({
      cursor: "",
      scopeId: SCOPE_ID,
      tables: repository.tableNames,
    });

    expect(initialPull.tables.map((table) => table.table)).toEqual([
      "locations",
      "items",
      "stock_counts",
    ]);
    expect(initialPull.cursor).toBe(initialStatus.cursor);

    const locationsTable = initialPull.tables.find(
      (table) => table.table === "locations"
    );
    const itemsTable = initialPull.tables.find(
      (table) => table.table === "items"
    );
    const stockCountsTable = initialPull.tables.find(
      (table) => table.table === "stock_counts"
    );

    expect(locationsTable).toBeDefined();
    expect(itemsTable).toBeDefined();
    expect(stockCountsTable).toBeDefined();

    expect(locationsTable?.changedRows).toHaveLength(1);
    expect(locationsTable?.deletedIds).toEqual(["loc-deleted"]);
    expect(locationsTable?.changedRows[0]).toMatchObject({
      createdAt: "2026-05-20T00:00:01.000Z",
      deletedAt: null,
      id: "loc-front",
      name: "Front Warehouse",
      scopeId: SCOPE_ID,
      updatedAt: "2026-05-20T00:00:01.000Z",
    });
    expect(hasSyncUpdatedAt(locationsTable?.changedRows[0])).toBe(false);

    expect(itemsTable?.changedRows).toHaveLength(1);
    expect(itemsTable?.deletedIds).toEqual(["item-deleted"]);
    expect(itemsTable?.changedRows[0]).toMatchObject({
      createdAt: "2026-05-20T00:00:03.000Z",
      deletedAt: null,
      id: "item-drill",
      locationId: "loc-front",
      name: "Cordless Drill",
      scopeId: SCOPE_ID,
      sku: "DRILL-01",
      updatedAt: "2026-05-20T00:00:03.000Z",
    });
    expect(hasSyncUpdatedAt(itemsTable?.changedRows[0])).toBe(false);

    expect(stockCountsTable?.changedRows).toHaveLength(1);
    expect(stockCountsTable?.deletedIds).toEqual(["count-deleted"]);
    expect(stockCountsTable?.changedRows[0]).toMatchObject({
      countedQuantity: 4,
      createdAt: "2026-05-20T00:00:05.000Z",
      deletedAt: null,
      id: "count-drill",
      itemId: "item-drill",
      recordedAt: "2026-05-20T00:00:05.000Z",
      scopeId: SCOPE_ID,
      updatedAt: "2026-05-20T00:00:05.000Z",
    });
    expect(hasSyncUpdatedAt(stockCountsTable?.changedRows[0])).toBe(false);

    const pushChanges = [
      {
        changedRows: [
          {
            createdAt: "2026-05-20T00:00:01.000Z",
            id: "loc-front",
            name: "Front Warehouse Updated",
            scopeId: SCOPE_ID,
            updatedAt: "2026-05-20T00:00:01.000Z",
          },
        ],
        deletedIds: [],
        table: "locations",
      },
      {
        changedRows: [
          {
            id: "item-wrench",
            locationId: "loc-front",
            name: "Adjustable Wrench",
            scopeId: SCOPE_ID,
          },
        ],
        deletedIds: [],
        table: "items",
      },
      {
        changedRows: [
          {
            countedQuantity: 7,
            id: "zz-stock-count",
            itemId: "item-wrench",
            scopeId: SCOPE_ID,
          },
        ],
        deletedIds: ["count-drill"],
        table: "stock_counts",
      },
    ] satisfies readonly SyncPushChange[];

    const pushResult = await repository.applyPushChanges({
      changes: pushChanges,
      scopeId: SCOPE_ID,
      syncUpdatedAt: PUSH_SYNC_UPDATED_AT,
    });

    expect(pushResult.tables.map((table) => table.table)).toEqual([
      "locations",
      "items",
      "stock_counts",
    ]);
    expect(pushResult.cursor).toBe(
      formatLatestSyncCursor({
        id: "zz-stock-count",
        syncUpdatedAt: PUSH_SYNC_UPDATED_AT,
        tableName: "stock_counts",
      })
    );

    expect(pushResult.tables[0].changedRows[0]).toMatchObject({
      createdAt: "2026-05-20T00:00:01.000Z",
      deletedAt: null,
      id: "loc-front",
      name: "Front Warehouse Updated",
      scopeId: SCOPE_ID,
      updatedAt: PUSH_TIME,
    });
    expect(pushResult.tables[0].deletedIds).toEqual(["loc-deleted"]);
    expect(hasSyncUpdatedAt(pushResult.tables[0].changedRows[0])).toBe(false);

    expect(pushResult.tables[1].changedRows[0]).toMatchObject({
      createdAt: PUSH_TIME,
      deletedAt: null,
      id: "item-wrench",
      locationId: "loc-front",
      name: "Adjustable Wrench",
      scopeId: SCOPE_ID,
      sku: null,
      updatedAt: PUSH_TIME,
    });
    expect(pushResult.tables[1].deletedIds).toEqual(["item-deleted"]);
    expect(hasSyncUpdatedAt(pushResult.tables[1].changedRows[0])).toBe(false);

    expect(pushResult.tables[2].changedRows[0]).toMatchObject({
      countedQuantity: 7,
      createdAt: PUSH_TIME,
      deletedAt: null,
      id: "zz-stock-count",
      itemId: "item-wrench",
      recordedAt: PUSH_TIME,
      scopeId: SCOPE_ID,
      updatedAt: PUSH_TIME,
    });
    expect(pushResult.tables[2].deletedIds).toEqual([
      "count-drill",
      "count-deleted",
    ]);
    expect(hasSyncUpdatedAt(pushResult.tables[2].changedRows[0])).toBe(false);

    const [updatedLocation] = await db
      .select()
      .from(locations)
      .where(eq(locations.id, "loc-front"))
      .limit(1);
    const [insertedItem] = await db
      .select()
      .from(items)
      .where(eq(items.id, "item-wrench"))
      .limit(1);
    const [softDeletedStockCount] = await db
      .select()
      .from(stockCounts)
      .where(eq(stockCounts.id, "count-drill"))
      .limit(1);

    expect(updatedLocation.name).toBe("Front Warehouse Updated");
    expect(updatedLocation.syncUpdatedAt).toBe(PUSH_SYNC_UPDATED_AT);

    expect(insertedItem).toMatchObject({
      createdAt: PUSH_TIME,
      deletedAt: null,
      id: "item-wrench",
      locationId: "loc-front",
      name: "Adjustable Wrench",
      scopeId: SCOPE_ID,
      sku: null,
      updatedAt: PUSH_TIME,
      syncUpdatedAt: PUSH_SYNC_UPDATED_AT,
    });

    expect(softDeletedStockCount.deletedAt).toBe(PUSH_TIME);
    expect(softDeletedStockCount.syncUpdatedAt).toBe(PUSH_SYNC_UPDATED_AT);

    const finalStatus = await repository.loadSyncStatus({
      cursor: initialStatus.cursor,
      scopeId: SCOPE_ID,
    });

    expect(finalStatus.changedTables).toEqual([
      "locations",
      "items",
      "stock_counts",
    ]);
    expect(finalStatus.hasChanges).toBe(true);
    expect(finalStatus.cursor).toBe(pushResult.cursor);
  });
});
