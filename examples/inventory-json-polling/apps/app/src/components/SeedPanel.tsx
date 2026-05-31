import { SYNC_SCOPE } from "@examples/sync-contract/constants";
import type { SyncClient } from "baresync";
import { useState } from "react";
import { useSyncClient } from "../hooks/useBaresyncQuery";
import { db, TABLE } from "../lib/db";

const LOCATION_SAMPLE_ID_PATTERN = /^loc-(\d+)$/;

async function getNextSampleIndex() {
  const rows = await db
    .select({ id: TABLE.locations.id })
    .from(TABLE.locations)
    .orderBy(TABLE.locations.id);
  const usedIndexes = new Set<number>();

  for (const row of rows) {
    const match = LOCATION_SAMPLE_ID_PATTERN.exec(row.id);
    if (!match?.[1]) {
      continue;
    }

    usedIndexes.add(Number(match[1]));
  }

  let index = 1;
  while (usedIndexes.has(index)) {
    index += 1;
  }

  return index;
}

export async function createSampleInventoryRows(
  client: SyncClient,
  index?: number
) {
  const sampleIndex = index ?? (await getNextSampleIndex());
  const suffix = String(sampleIndex).padStart(3, "0");
  const timestamp = new Date().toISOString();
  const locationId = `loc-${suffix}`;
  const itemId = `item-${suffix}`;
  const countId = `count-${suffix}`;

  await client.writeTransaction(db, async (tx) => {
    await client.writeLocalChange(tx, {
      operation: "insert",
      rowId: locationId,
      table: TABLE.locations,
      write: (writeTx) =>
        writeTx.insert(TABLE.locations).values({
          id: locationId,
          scopeId: SYNC_SCOPE,
          name: `Aisle ${suffix}`,
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
    });

    await client.writeLocalChange(tx, {
      operation: "insert",
      rowId: itemId,
      table: TABLE.items,
      write: (writeTx) =>
        writeTx.insert(TABLE.items).values({
          id: itemId,
          scopeId: SYNC_SCOPE,
          locationId,
          name: `Item ${suffix}`,
          sku: `SKU-${suffix}`,
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
    });

    await client.writeLocalChange(tx, {
      operation: "insert",
      rowId: countId,
      table: TABLE.stockCounts,
      write: (writeTx) =>
        writeTx.insert(TABLE.stockCounts).values({
          id: countId,
          scopeId: SYNC_SCOPE,
          itemId,
          countedQuantity: 8 + sampleIndex,
          recordedAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
    });
  });

  return { countId, itemId, locationId };
}

interface SeedPanelProps {
  onSeeded: () => Promise<void>;
  onStatus: (msg: string) => void;
}

export function SeedPanel({ onSeeded, onStatus }: SeedPanelProps) {
  const [seeding, setSeeding] = useState(false);
  const client = useSyncClient();

  async function handleSeed() {
    setSeeding(true);
    try {
      const { countId, itemId, locationId } =
        await createSampleInventoryRows(client);

      onStatus(`Created ${locationId}, ${itemId}, and ${countId}`);
      await onSeeded();
    } catch (error) {
      onStatus(`Create failed: ${String(error)}`);
    } finally {
      setSeeding(false);
    }
  }

  return (
    <section className="rounded-3xl border border-cream-300 bg-cream-50 p-5 shadow-[0_24px_60px_rgba(49,33,17,0.08)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-medium font-serif text-wood-900 text-xl">
            Seed a row
          </h2>
          <p className="mt-1 text-sm text-wood-500">
            Writes in one Baresync transaction and queues sync changes.
          </p>
        </div>
        <button
          className="shrink-0 cursor-pointer rounded-full bg-forest-500 px-5 py-2 font-medium text-sm text-white transition-all hover:bg-forest-600 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
          disabled={seeding}
          onClick={handleSeed}
          type="button"
        >
          {seeding ? "Creating\u2026" : "Create sample record"}
        </button>
      </div>
    </section>
  );
}
