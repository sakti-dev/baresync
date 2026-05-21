import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import type { SyncClient } from "baresync/tauri";
import { desc, eq } from "drizzle-orm";
import { useState } from "react";
import { DataTable } from "./components/DataTable";
import { SeedPanel } from "./components/SeedPanel";
import { StatusMessage } from "./components/StatusMessage";
import { SyncPanel } from "./components/SyncPanel";
import {
  SyncClientProvider,
  useDrizzleQuery,
  useSyncClient,
} from "./hooks/useBaresyncQuery";
import {
  COUNT_COLUMNS,
  ITEM_COLUMNS,
  LOCATION_COLUMNS,
} from "./lib/columns.constant";
import { db, TABLE } from "./lib/db";

type InventoryTable =
  | typeof TABLE.locations
  | typeof TABLE.items
  | typeof TABLE.stockCounts;

async function invalidateInventory(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: ["inventory"] });
  await queryClient.invalidateQueries({ queryKey: ["sync-state"] });
}

function makeSoftDelete(
  client: SyncClient,
  table: InventoryTable,
  onStatus: (msg: string) => void,
  onInvalidated: () => Promise<void>
) {
  return async (row: Record<string, unknown>) => {
    const timestamp = new Date().toISOString();

    await client.writeTransaction(db, async (tx) => {
      await client.writeLocalChange(tx, {
        operation: "update",
        rowId: row.id as string,
        table,
        write: (writeTx) =>
          writeTx
            .update(table)
            .set({
              deletedAt: timestamp,
              isSynced: false,
              updatedAt: timestamp,
            })
            .where(eq(table.id, row.id as string)),
      });
    });

    await onInvalidated();
    onStatus(`Deleted ${row.id}`);
  };
}

export function App() {
  return (
    <SyncClientProvider>
      <InventoryApp />
    </SyncClientProvider>
  );
}

function InventoryApp() {
  const [status, setStatus] = useState("Loading…");
  const queryClient = useQueryClient();
  const client = useSyncClient();

  const locationsQuery = useDrizzleQuery(["inventory", "locations"], () =>
    db.select().from(TABLE.locations).orderBy(desc(TABLE.locations.updatedAt))
  );
  const itemsQuery = useDrizzleQuery(["inventory", "items"], () =>
    db.select().from(TABLE.items).orderBy(desc(TABLE.items.updatedAt))
  );
  const stockCountsQuery = useDrizzleQuery(["inventory", "stock-counts"], () =>
    db
      .select()
      .from(TABLE.stockCounts)
      .orderBy(desc(TABLE.stockCounts.updatedAt))
  );

  async function refreshAll() {
    await invalidateInventory(queryClient);
  }

  return (
    <main className="mx-auto grid max-w-[1120px] gap-6 p-8">
      <header className="max-w-[720px] animate-fade-up">
        <p className="mb-3 text-forest-500 text-xs uppercase tracking-[0.18em]">
          Baresync example
        </p>
        <h2 className="font-serif text-[clamp(2.8rem,7vw,5.4rem)] text-wood-900 leading-[0.96] tracking-tight">
          Inventory
        </h2>
        <p className="mt-3 max-w-3xl text-[1.05rem] text-wood-500">
          Single-scope inventory for a Tauri app and a Hono server.
        </p>
      </header>

      <SyncPanel />

      <SeedPanel onSeeded={refreshAll} onStatus={setStatus} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-5">
        <DataTable
          columns={LOCATION_COLUMNS}
          error={locationsQuery.error}
          loading={locationsQuery.loading}
          onDelete={makeSoftDelete(
            client,
            TABLE.locations,
            setStatus,
            refreshAll
          )}
          onStatus={setStatus}
          rows={locationsQuery.rows}
          title="Locations"
        />
        <DataTable
          columns={ITEM_COLUMNS}
          error={itemsQuery.error}
          loading={itemsQuery.loading}
          onDelete={makeSoftDelete(client, TABLE.items, setStatus, refreshAll)}
          onStatus={setStatus}
          rows={itemsQuery.rows}
          title="Items"
        />
        <DataTable
          columns={COUNT_COLUMNS}
          error={stockCountsQuery.error}
          loading={stockCountsQuery.loading}
          onDelete={makeSoftDelete(
            client,
            TABLE.stockCounts,
            setStatus,
            refreshAll
          )}
          onStatus={setStatus}
          rows={stockCountsQuery.rows}
          title="Stock counts"
        />
      </div>

      <StatusMessage status={status} />
    </main>
  );
}
