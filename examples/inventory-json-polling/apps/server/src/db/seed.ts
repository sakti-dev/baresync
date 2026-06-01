import { syncBatchRequests } from "@sync-contract/api-schema";
import {
  items,
  locations,
  stockCounts,
} from "@sync-contract/api-synced-schema";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { createInventoryDatabase } from "./client";

const SEED_TIME = "2026-05-20T00:00:00.000Z";
const SEED_SYNC_UPDATED_AT = Date.parse(SEED_TIME);

const seedLocations = [
  {
    id: "loc-front",
    scopeId: "default",
    name: "Front Warehouse",
    deletedAt: null,
    createdAt: SEED_TIME,
    updatedAt: SEED_TIME,
    syncUpdatedAt: SEED_SYNC_UPDATED_AT,
  },
];

const seedItems = [
  {
    id: "item-drill",
    scopeId: "default",
    locationId: "loc-front",
    name: "Cordless Drill",
    sku: "DRILL-01",
    deletedAt: null,
    createdAt: SEED_TIME,
    updatedAt: SEED_TIME,
    syncUpdatedAt: SEED_SYNC_UPDATED_AT,
  },
];

const seedStockCounts = [
  {
    id: "count-drill",
    scopeId: "default",
    itemId: "item-drill",
    countedQuantity: 4,
    recordedAt: SEED_TIME,
    deletedAt: null,
    createdAt: SEED_TIME,
    updatedAt: SEED_TIME,
    syncUpdatedAt: SEED_SYNC_UPDATED_AT,
  },
];

// Shared seed logic used by the app and the dev entrypoint.
export async function seedInventoryDatabase(
  db: BunSQLiteDatabase<Record<string, never>>
): Promise<void> {
  const existing = await db
    .select({ id: locations.id })
    .from(locations)
    .limit(1);
  if (existing.length > 0) {
    return;
  }

  await db.transaction(async (tx) => {
    await tx.insert(locations).values(seedLocations);
    await tx.insert(items).values(seedItems);
    await tx.insert(stockCounts).values(seedStockCounts);
  });
}

export function getSeedCursor() {
  return {
    id: "count-drill",
    syncUpdatedAt: SEED_SYNC_UPDATED_AT,
    tableName: "stock_counts",
  } as const;
}

// `bun run src/db/seed.ts` uses this path through `predev`.
export async function seedInventoryDatabaseForDev(): Promise<void> {
  const { db } = await createInventoryDatabase();
  await db.delete(syncBatchRequests);
  await seedInventoryDatabase(db);
}

if (import.meta.main) {
  await seedInventoryDatabaseForDev();
  console.log("inventory database seeded");
}
