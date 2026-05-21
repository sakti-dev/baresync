import { INVENTORY_SCOPE_ID } from "@example/inventory-sync-contract/constants";
import type { SyncClient } from "baresync";
import { useState } from "react";
import { useSyncClient } from "../hooks/useBaresyncQuery";
import { db, TABLE } from "../lib/db";

export async function createSampleInventoryRows(
  client: SyncClient,
  index: number
) {
  const suffix = String(index).padStart(3, "0");
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
          scopeId: INVENTORY_SCOPE_ID,
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
          scopeId: INVENTORY_SCOPE_ID,
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
          scopeId: INVENTORY_SCOPE_ID,
          itemId,
          countedQuantity: 8 + index,
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

let nextIndex = 1;

export function SeedPanel({ onSeeded, onStatus }: SeedPanelProps) {
  const [seeding, setSeeding] = useState(false);
  const client = useSyncClient();

  async function handleSeed() {
    setSeeding(true);
    try {
      const { countId, itemId, locationId } = await createSampleInventoryRows(
        client,
        nextIndex
      );
      nextIndex += 1;

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
