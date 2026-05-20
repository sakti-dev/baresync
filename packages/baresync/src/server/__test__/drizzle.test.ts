import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { and, desc, eq, gt, type InferInsertModel } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import {
  createDrizzleSyncRepository,
  type DrizzleSyncReadRow,
  optionalString,
  requiredNumber,
  requiredString,
} from "../drizzle";

const locations = sqliteTable("locations", {
  createdAt: text("created_at").notNull(),
  deletedAt: text("deleted_at"),
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  scopeId: text("scope_id").notNull(),
  syncUpdatedAt: integer("sync_updated_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

const items = sqliteTable("items", {
  createdAt: text("created_at").notNull(),
  deletedAt: text("deleted_at"),
  id: text("id").primaryKey(),
  locationId: text("location_id").notNull(),
  name: text("name").notNull(),
  scopeId: text("scope_id").notNull(),
  sku: text("sku"),
  syncUpdatedAt: integer("sync_updated_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

const stockCounts = sqliteTable("stock_counts", {
  countedQuantity: integer("counted_quantity").notNull(),
  createdAt: text("created_at").notNull(),
  deletedAt: text("deleted_at"),
  id: text("id").primaryKey(),
  itemId: text("item_id").notNull(),
  recordedAt: text("recorded_at").notNull(),
  scopeId: text("scope_id").notNull(),
  syncUpdatedAt: integer("sync_updated_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

function createTestDb(): BunSQLiteDatabase<Record<string, never>> {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE locations (
      id TEXT PRIMARY KEY NOT NULL,
      scope_id TEXT NOT NULL,
      name TEXT NOT NULL,
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_updated_at INTEGER NOT NULL
    );
    CREATE TABLE items (
      id TEXT PRIMARY KEY NOT NULL,
      scope_id TEXT NOT NULL,
      location_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sku TEXT,
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_updated_at INTEGER NOT NULL
    );
    CREATE TABLE stock_counts (
      id TEXT PRIMARY KEY NOT NULL,
      scope_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      counted_quantity INTEGER NOT NULL,
      recorded_at TEXT NOT NULL,
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_updated_at INTEGER NOT NULL
    );
  `);
  return drizzle(sqlite) as unknown as BunSQLiteDatabase<Record<string, never>>;
}

function createRepository(db = createTestDb()) {
  return createDrizzleSyncRepository({
    tables: {
      locations: {
        buildRow: ({ row, scopeId, syncUpdatedAt, updatedAt }) =>
          ({
            createdAt: optionalString(row.createdAt) ?? updatedAt,
            deletedAt: optionalString(row.deletedAt),
            id: requiredString(row.id, "locations.id"),
            name: requiredString(row.name, "locations.name"),
            scopeId,
            syncUpdatedAt,
            updatedAt,
          }) satisfies InferInsertModel<typeof locations>,
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
        readRows: async ({ cursorTimestamp, scopeId }) => {
          const rows = await db
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
            );
          return rows as readonly DrizzleSyncReadRow[];
        },
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
        buildRow: ({ row, scopeId, syncUpdatedAt, updatedAt }) =>
          ({
            createdAt: optionalString(row.createdAt) ?? updatedAt,
            deletedAt: optionalString(row.deletedAt),
            id: requiredString(row.id, "items.id"),
            locationId: requiredString(row.locationId, "items.locationId"),
            name: requiredString(row.name, "items.name"),
            scopeId,
            sku: optionalString(row.sku),
            syncUpdatedAt,
            updatedAt,
          }) satisfies InferInsertModel<typeof items>,
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
        readRows: async ({ cursorTimestamp, scopeId }) => {
          const rows = await db
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
            );
          return rows as readonly DrizzleSyncReadRow[];
        },
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
        buildRow: ({ row, scopeId, syncUpdatedAt, updatedAt }) =>
          ({
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
          }) satisfies InferInsertModel<typeof stockCounts>,
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
        readRows: async ({ cursorTimestamp, scopeId }) => {
          const rows = await db
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
            );
          return rows as readonly DrizzleSyncReadRow[];
        },
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
}

describe("validation helpers", () => {
  it("validates required strings", () => {
    expect(requiredString("value", "items.name")).toBe("value");
    expect(() => requiredString(123, "items.name")).toThrow(
      "Expected items.name to be a string"
    );
  });

  it("normalizes optional strings to null", () => {
    expect(optionalString("value")).toBe("value");
    expect(optionalString(null)).toBeNull();
    expect(optionalString(undefined)).toBeNull();
  });

  it("validates required numbers", () => {
    expect(requiredNumber(42, "stock_counts.countedQuantity")).toBe(42);
    expect(() =>
      requiredNumber(Number.NaN, "stock_counts.countedQuantity")
    ).toThrow("Expected stock_counts.countedQuantity to be a finite number");
  });
});

describe("createDrizzleSyncRepository", () => {
  it("exposes configured table names", () => {
    const repository = createRepository();
    expect(repository.tableNames).toEqual([
      "locations",
      "items",
      "stock_counts",
    ]);
  });

  it("rejects unknown push tables", async () => {
    const repository = createRepository();
    await expect(
      repository.applyPushChanges({
        changes: [
          {
            table: "unknown",
            changedRows: [],
            deletedIds: [],
          },
        ],
        scopeId: "default",
        syncUpdatedAt: 123,
      })
    ).rejects.toThrow('Unsupported sync table: "unknown"');
  });
});

describe("loadPullChanges", () => {
  it("filters requested tables, preserves order, and splits changed and deleted rows", async () => {
    const db = createTestDb();
    await db.insert(locations).values([
      {
        createdAt: "2026-05-20T00:00:00.000Z",
        deletedAt: null,
        id: "location-1",
        name: "Front Warehouse",
        scopeId: "default",
        syncUpdatedAt: 100,
        updatedAt: "2026-05-20T00:00:00.000Z",
      },
    ]);
    await db.insert(items).values([
      {
        createdAt: "2026-05-20T00:01:00.000Z",
        deletedAt: null,
        id: "item-1",
        locationId: "location-1",
        name: "Cordless Drill",
        scopeId: "default",
        sku: "DRILL-01",
        syncUpdatedAt: 200,
        updatedAt: "2026-05-20T00:01:00.000Z",
      },
      {
        createdAt: "2026-05-20T00:02:00.000Z",
        deletedAt: "2026-05-20T00:03:00.000Z",
        id: "item-2",
        locationId: "location-1",
        name: "Old Wrench",
        scopeId: "default",
        sku: null,
        syncUpdatedAt: 150,
        updatedAt: "2026-05-20T00:02:00.000Z",
      },
    ]);
    await db.insert(stockCounts).values([
      {
        countedQuantity: 4,
        createdAt: "2026-05-20T00:04:00.000Z",
        deletedAt: null,
        id: "count-1",
        itemId: "item-1",
        recordedAt: "2026-05-20T00:04:00.000Z",
        scopeId: "default",
        syncUpdatedAt: 300,
        updatedAt: "2026-05-20T00:04:00.000Z",
      },
    ]);
    const repository = createRepository(db);

    const response = await repository.loadPullChanges({
      cursor: "",
      scopeId: "default",
      tables: ["items", "unknown", "locations"],
    });

    expect(response.hasMore).toBe(false);
    expect(response.cursor).toBe("sync:300:stock_counts:count-1");
    expect(response.tables.map((table) => table.table)).toEqual([
      "items",
      "locations",
    ]);
    expect(response.tables[0]).toEqual({
      table: "items",
      changedRows: [
        {
          createdAt: "2026-05-20T00:01:00.000Z",
          deletedAt: null,
          id: "item-1",
          locationId: "location-1",
          name: "Cordless Drill",
          scopeId: "default",
          sku: "DRILL-01",
          updatedAt: "2026-05-20T00:01:00.000Z",
        },
      ],
      deletedIds: ["item-2"],
    });
    expect(response.tables[1]).toEqual({
      table: "locations",
      changedRows: [
        {
          createdAt: "2026-05-20T00:00:00.000Z",
          deletedAt: null,
          id: "location-1",
          name: "Front Warehouse",
          scopeId: "default",
          updatedAt: "2026-05-20T00:00:00.000Z",
        },
      ],
      deletedIds: [],
    });
  });

  it("includes all tables by default and returns an empty cursor when no rows exist", async () => {
    const repository = createRepository(createTestDb());

    const response = await repository.loadPullChanges({
      cursor: "",
      scopeId: "missing",
      tables: [],
    });

    expect(response.tables.map((table) => table.table)).toEqual([
      "locations",
      "items",
      "stock_counts",
    ]);
    expect(response.cursor).toBe("");
  });
});

describe("loadSyncStatus", () => {
  it("reports changed tables since the cursor", async () => {
    const db = createTestDb();
    await db.insert(locations).values([
      {
        createdAt: "2026-05-20T00:00:00.000Z",
        deletedAt: null,
        id: "location-1",
        name: "Front Warehouse",
        scopeId: "default",
        syncUpdatedAt: 100,
        updatedAt: "2026-05-20T00:00:00.000Z",
      },
    ]);
    await db.insert(items).values([
      {
        createdAt: "2026-05-20T00:01:00.000Z",
        deletedAt: null,
        id: "item-1",
        locationId: "location-1",
        name: "Cordless Drill",
        scopeId: "default",
        sku: "DRILL-01",
        syncUpdatedAt: 200,
        updatedAt: "2026-05-20T00:01:00.000Z",
      },
      {
        createdAt: "2026-05-20T00:02:00.000Z",
        deletedAt: "2026-05-20T00:03:00.000Z",
        id: "item-2",
        locationId: "location-1",
        name: "Old Wrench",
        scopeId: "default",
        sku: null,
        syncUpdatedAt: 150,
        updatedAt: "2026-05-20T00:02:00.000Z",
      },
    ]);
    await db.insert(stockCounts).values([
      {
        countedQuantity: 4,
        createdAt: "2026-05-20T00:04:00.000Z",
        deletedAt: null,
        id: "count-1",
        itemId: "item-1",
        recordedAt: "2026-05-20T00:04:00.000Z",
        scopeId: "default",
        syncUpdatedAt: 300,
        updatedAt: "2026-05-20T00:04:00.000Z",
      },
    ]);
    const repository = createRepository(db);

    const response = await repository.loadSyncStatus({
      cursor: "sync:120:items:item-1",
      scopeId: "default",
    });

    expect(response.changedTables).toEqual(["items", "stock_counts"]);
    expect(response.hasChanges).toBe(true);
    expect(response.cursor).toBe("sync:300:stock_counts:count-1");
  });

  it("returns no changes when nothing changed since the cursor", async () => {
    const db = createTestDb();
    await db.insert(locations).values([
      {
        createdAt: "2026-05-20T00:00:00.000Z",
        deletedAt: null,
        id: "location-1",
        name: "Front Warehouse",
        scopeId: "default",
        syncUpdatedAt: 100,
        updatedAt: "2026-05-20T00:00:00.000Z",
      },
    ]);
    await db.insert(items).values([
      {
        createdAt: "2026-05-20T00:01:00.000Z",
        deletedAt: null,
        id: "item-1",
        locationId: "location-1",
        name: "Cordless Drill",
        scopeId: "default",
        sku: "DRILL-01",
        syncUpdatedAt: 200,
        updatedAt: "2026-05-20T00:01:00.000Z",
      },
      {
        createdAt: "2026-05-20T00:02:00.000Z",
        deletedAt: "2026-05-20T00:03:00.000Z",
        id: "item-2",
        locationId: "location-1",
        name: "Old Wrench",
        scopeId: "default",
        sku: null,
        syncUpdatedAt: 150,
        updatedAt: "2026-05-20T00:02:00.000Z",
      },
    ]);
    await db.insert(stockCounts).values([
      {
        countedQuantity: 4,
        createdAt: "2026-05-20T00:04:00.000Z",
        deletedAt: null,
        id: "count-1",
        itemId: "item-1",
        recordedAt: "2026-05-20T00:04:00.000Z",
        scopeId: "default",
        syncUpdatedAt: 300,
        updatedAt: "2026-05-20T00:04:00.000Z",
      },
    ]);
    const repository = createRepository(db);

    const response = await repository.loadSyncStatus({
      cursor: "sync:999:stock_counts:count-1",
      scopeId: "default",
    });

    expect(response.changedTables).toEqual([]);
    expect(response.hasChanges).toBe(false);
    expect(response.cursor).toBe("sync:300:stock_counts:count-1");
  });
});

describe("applyPushChanges", () => {
  it("upserts changed rows and soft-deletes deleted ids", async () => {
    const db = createTestDb();
    await db.insert(locations).values([
      {
        createdAt: "2026-05-20T00:00:00.000Z",
        deletedAt: null,
        id: "location-1",
        name: "Front Warehouse",
        scopeId: "default",
        syncUpdatedAt: 100,
        updatedAt: "2026-05-20T00:00:00.000Z",
      },
    ]);
    await db.insert(items).values([
      {
        createdAt: "2026-05-20T00:01:00.000Z",
        deletedAt: null,
        id: "item-1",
        locationId: "location-1",
        name: "Cordless Drill",
        scopeId: "default",
        sku: "DRILL-01",
        syncUpdatedAt: 200,
        updatedAt: "2026-05-20T00:01:00.000Z",
      },
      {
        createdAt: "2026-05-20T00:02:00.000Z",
        deletedAt: "2026-05-20T00:03:00.000Z",
        id: "item-2",
        locationId: "location-1",
        name: "Old Wrench",
        scopeId: "default",
        sku: null,
        syncUpdatedAt: 150,
        updatedAt: "2026-05-20T00:02:00.000Z",
      },
    ]);
    await db.insert(stockCounts).values([
      {
        countedQuantity: 4,
        createdAt: "2026-05-20T00:04:00.000Z",
        deletedAt: null,
        id: "count-1",
        itemId: "item-1",
        recordedAt: "2026-05-20T00:04:00.000Z",
        scopeId: "default",
        syncUpdatedAt: 300,
        updatedAt: "2026-05-20T00:04:00.000Z",
      },
    ]);
    await db.insert(items).values([
      {
        createdAt: "2026-05-20T01:00:00.000Z",
        deletedAt: null,
        id: "item-existing",
        locationId: "location-1",
        name: "Old Name",
        scopeId: "default",
        sku: "OLD-1",
        syncUpdatedAt: 50,
        updatedAt: "2026-05-20T01:00:00.000Z",
      },
      {
        createdAt: "2026-05-20T01:01:00.000Z",
        deletedAt: null,
        id: "item-delete-me",
        locationId: "location-1",
        name: "Delete Me",
        scopeId: "default",
        sku: "DEL-1",
        syncUpdatedAt: 60,
        updatedAt: "2026-05-20T01:01:00.000Z",
      },
    ]);
    const repository = createRepository(db);
    const syncUpdatedAt = 1_700_000_123_000;
    const updatedAt = new Date(syncUpdatedAt).toISOString();

    await repository.applyPushChanges({
      changes: [
        {
          table: "items",
          changedRows: [
            {
              createdAt: "2026-05-20T01:02:00.000Z",
              id: "item-existing",
              locationId: "location-1",
              name: "Updated Name",
              sku: "NEW-1",
            },
            {
              id: "item-new",
              locationId: "location-1",
              name: "Inserted Name",
              sku: null,
            },
          ],
          deletedIds: ["item-delete-me"],
        },
      ],
      scopeId: "default",
      syncUpdatedAt,
    });

    const rows = await db
      .select()
      .from(items)
      .where(eq(items.scopeId, "default"));

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          createdAt: "2026-05-20T01:02:00.000Z",
          deletedAt: null,
          id: "item-existing",
          locationId: "location-1",
          name: "Updated Name",
          scopeId: "default",
          sku: "NEW-1",
          syncUpdatedAt,
          updatedAt,
        }),
        expect.objectContaining({
          createdAt: updatedAt,
          deletedAt: null,
          id: "item-new",
          locationId: "location-1",
          name: "Inserted Name",
          scopeId: "default",
          sku: null,
          syncUpdatedAt,
          updatedAt,
        }),
        expect.objectContaining({
          createdAt: "2026-05-20T01:01:00.000Z",
          deletedAt: updatedAt,
          id: "item-delete-me",
          locationId: "location-1",
          name: "Delete Me",
          scopeId: "default",
          sku: "DEL-1",
          syncUpdatedAt,
          updatedAt,
        }),
      ])
    );
  });
});
