import type { SyncPushChange } from "baresync/server";

interface Row {
  [key: string]: unknown;
}

type TableName = "locations" | "items" | "stock_counts";

function asRow(input: unknown): Row {
  if (typeof input === "object" && input !== null) {
    return input as Row;
  }

  return {};
}

export interface InventoryScope {
  scopeId: string;
}

interface PullTable {
  changedRows: Row[];
  deletedIds: string[];
  table: string;
}

interface SeedState {
  items: Row[];
  locations: Row[];
  stockCounts: Row[];
}

interface InventoryStore extends SeedState {
  lastCursor: string;
}

export function createSeedState(): SeedState {
  return {
    locations: [
      {
        id: "loc-front",
        scopeId: "default",
        name: "Front Warehouse",
        deletedAt: null,
        isSynced: true,
        createdAt: "2026-05-20T00:00:00.000Z",
        updatedAt: "2026-05-20T00:00:00.000Z",
      },
    ],
    items: [
      {
        id: "item-drill",
        scopeId: "default",
        locationId: "loc-front",
        name: "Cordless Drill",
        sku: "DRILL-01",
        deletedAt: null,
        isSynced: true,
        createdAt: "2026-05-20T00:00:00.000Z",
        updatedAt: "2026-05-20T00:00:00.000Z",
      },
    ],
    stockCounts: [
      {
        id: "count-drill",
        scopeId: "default",
        itemId: "item-drill",
        countedQuantity: 4,
        recordedAt: "2026-05-20T00:00:00.000Z",
        deletedAt: null,
        isSynced: true,
        createdAt: "2026-05-20T00:00:00.000Z",
        updatedAt: "2026-05-20T00:00:00.000Z",
      },
    ],
  };
}

export function inventoryState(seed: SeedState) {
  const store: InventoryStore = {
    ...seed,
    lastCursor: "sync:2026-05-20T00:00:00.000Z:stock_counts:count-drill",
  };

  const normalize = (row: Row): Row => ({
    ...row,
    deletedAt: row.deletedAt ?? null,
  });

  const upsert = (rows: Row[], row: Row) => {
    const normalized = normalize(row);
    const index = rows.findIndex((entry) => entry.id === normalized.id);
    if (index === -1) {
      rows.push(normalized);
      return;
    }

    rows[index] = normalized;
  };

  const tablePayloads = (): PullTable[] => [
    {
      table: "locations",
      changedRows: store.locations.map(normalize),
      deletedIds: [],
    },
    {
      table: "items",
      changedRows: store.items.map(normalize),
      deletedIds: [],
    },
    {
      table: "stock_counts",
      changedRows: store.stockCounts.map(normalize),
      deletedIds: [],
    },
  ];

  function createTableUpdaters(scopeId: string, syncUpdatedAt: number) {
    const updatedAt = new Date(syncUpdatedAt).toISOString();

    return {
      locations(row: unknown) {
        upsert(store.locations, {
          ...asRow(row),
          scopeId,
          isSynced: true,
          updatedAt,
        });
      },
      items(row: unknown) {
        upsert(store.items, {
          ...asRow(row),
          scopeId,
          isSynced: true,
          updatedAt,
        });
      },
      stock_counts(row: unknown) {
        upsert(store.stockCounts, {
          ...asRow(row),
          scopeId,
          isSynced: true,
          updatedAt,
        });
      },
    } satisfies Record<TableName, (row: unknown) => void>;
  }

  return {
    applyPush(
      changes: readonly SyncPushChange[],
      scopeId: string,
      syncUpdatedAt: number
    ) {
      const updaters = createTableUpdaters(scopeId, syncUpdatedAt);

      for (const change of changes) {
        const updater = updaters[change.table as TableName];
        if (!updater) {
          continue;
        }

        for (const row of change.changedRows) {
          updater(row);
        }
      }

      store.lastCursor = `sync:${syncUpdatedAt}:stock_counts:${store.stockCounts.at(-1)?.id ?? "seed"}`;
    },
    toPushResponse() {
      return {
        serverTime: "2026-05-20T00:00:00.000Z",
        tables: tablePayloads(),
      };
    },
    toPullResponse(scopeId: string) {
      return {
        cursor: store.lastCursor,
        hasMore: false,
        serverTime: "2026-05-20T00:00:00.000Z",
        tables: tablePayloads().map((table) => ({
          ...table,
          changedRows: table.changedRows.filter(
            (row) => row.scopeId === scopeId
          ),
        })),
      };
    },
    toStatusResponse() {
      return {
        changedTables: ["locations", "items", "stock_counts"],
        hasChanges: true,
        cursor: store.lastCursor,
        serverTime: "2026-05-20T00:00:00.000Z",
      };
    },
  };
}

export async function createIdempotencyDb() {
  // @ts-expect-error Bun runtime module is only available in the example app.
  const { Database } = await import("bun:sqlite");
  const { drizzle } = await import("drizzle-orm/bun-sqlite");

  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sync_batch_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      status TEXT NOT NULL,
      response_body TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      UNIQUE(client_id, idempotency_key)
    )
  `);

  return drizzle(
    sqlite
  ) as unknown as import("drizzle-orm/sqlite-proxy").SqliteRemoteDatabase;
}
