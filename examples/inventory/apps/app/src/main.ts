import "./styles.css";
import { invoke } from "@tauri-apps/api/core";
import { createSyncClient } from "baresync/tauri";
import { INVENTORY_SCOPE_ID } from "../../../packages/sync-contract/src/schema";

const syncClient = createSyncClient({
  apiUrl: "http://127.0.0.1:18181",
  encoding: "json",
  scopeId: INVENTORY_SCOPE_ID,
  invoke,
});

const el = <T extends HTMLElement>(selector: string) =>
  document.querySelector(selector) as T;

const status = el<HTMLElement>("#status");
const dirtyCount = el<HTMLElement>("#dirty-count");
const watermark = el<HTMLElement>("#watermark");
const needsBaseline = el<HTMLElement>("#needs-baseline");
const locationsList = el<HTMLUListElement>("#locations-list");
const itemsList = el<HTMLUListElement>("#items-list");
const countsList = el<HTMLUListElement>("#counts-list");
const syncButton = el<HTMLButtonElement>("#sync-now");
const seedButton = el<HTMLButtonElement>("#seed-row");

let nextIndex = 1;

function nowIso() {
  return new Date().toISOString();
}

function toPlainRow(row: InventorySqlRow): Record<string, unknown> {
  return Object.fromEntries(
    row.columns.map((column, index) => [column, row.values[index]])
  );
}

async function queryRows(sql: string) {
  const rows = (await invoke("run_sql", {
    query: {
      sql,
      params: [],
      method: "all",
    },
  })) as InventorySqlRow[];

  return rows.map(toPlainRow);
}

function renderList(list: HTMLUListElement, rows: Record<string, unknown>[]) {
  list.replaceChildren();

  if (rows.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No rows yet.";
    list.appendChild(li);
    return;
  }

  for (const row of rows) {
    const li = document.createElement("li");
    li.textContent = JSON.stringify(row);
    list.appendChild(li);
  }
}

async function refresh() {
  const [localState, locations, items, counts] = await Promise.all([
    syncClient.getState(),
    queryRows(
      "SELECT id, scope_id, name, created_at, updated_at, deleted_at, is_synced FROM locations ORDER BY updated_at DESC"
    ),
    queryRows(
      "SELECT id, scope_id, location_id, name, sku, created_at, updated_at, deleted_at, is_synced FROM items ORDER BY updated_at DESC"
    ),
    queryRows(
      "SELECT id, scope_id, item_id, counted_quantity, recorded_at, created_at, updated_at, deleted_at, is_synced FROM stock_counts ORDER BY updated_at DESC"
    ),
  ]);

  dirtyCount.textContent = String(localState.local_dirty_count);
  watermark.textContent = localState.last_server_watermark || "-";
  needsBaseline.textContent = localState.needs_baseline_sync ? "yes" : "no";
  renderList(locationsList, locations);
  renderList(itemsList, items);
  renderList(countsList, counts);
  status.textContent = "Ready";
}

async function createSampleRecord() {
  const suffix = String(nextIndex++).padStart(3, "0");
  const timestamp = nowIso();
  const locationId = `loc-${suffix}`;
  const itemId = `item-${suffix}`;
  const countId = `count-${suffix}`;

  await invoke("run_sql_batch", {
    statements: [
      {
        sql: "INSERT INTO locations (id, scope_id, name, deleted_at, is_synced, created_at, updated_at) VALUES (?1, ?2, ?3, NULL, 0, ?4, ?4)",
        params: [locationId, INVENTORY_SCOPE_ID, `Aisle ${suffix}`, timestamp],
      },
      {
        sql: "INSERT INTO sync_outbox (id, table_name, row_id, operation, payload, scope_id, changed_at, synced_at) VALUES (?1, ?2, ?3, 'insert', NULL, ?4, ?5, NULL)",
        params: [
          `outbox-${locationId}`,
          "locations",
          locationId,
          INVENTORY_SCOPE_ID,
          timestamp,
        ],
      },
      {
        sql: "INSERT INTO items (id, scope_id, location_id, name, sku, deleted_at, is_synced, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, NULL, 0, ?6, ?6)",
        params: [
          itemId,
          INVENTORY_SCOPE_ID,
          locationId,
          `Item ${suffix}`,
          `SKU-${suffix}`,
          timestamp,
        ],
      },
      {
        sql: "INSERT INTO sync_outbox (id, table_name, row_id, operation, payload, scope_id, changed_at, synced_at) VALUES (?1, ?2, ?3, 'insert', NULL, ?4, ?5, NULL)",
        params: [
          `outbox-${itemId}`,
          "items",
          itemId,
          INVENTORY_SCOPE_ID,
          timestamp,
        ],
      },
      {
        sql: "INSERT INTO stock_counts (id, scope_id, item_id, counted_quantity, recorded_at, deleted_at, is_synced, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, NULL, 0, ?5, ?5)",
        params: [countId, INVENTORY_SCOPE_ID, itemId, 8 + nextIndex, timestamp],
      },
      {
        sql: "INSERT INTO sync_outbox (id, table_name, row_id, operation, payload, scope_id, changed_at, synced_at) VALUES (?1, ?2, ?3, 'insert', NULL, ?4, ?5, NULL)",
        params: [
          `outbox-${countId}`,
          "stock_counts",
          countId,
          INVENTORY_SCOPE_ID,
          timestamp,
        ],
      },
    ],
  });

  status.textContent = `Created ${locationId}, ${itemId}, and ${countId}`;
  await refresh();
}

async function syncNow() {
  syncButton.disabled = true;
  seedButton.disabled = true;
  try {
    status.textContent = "Syncing…";
    await syncClient.syncNow();
    status.textContent = "Synced with server";
    await refresh();
  } finally {
    syncButton.disabled = false;
    seedButton.disabled = false;
  }
}

syncButton.addEventListener("click", () => {
  syncNow().catch((error: unknown) => {
    status.textContent = `Sync failed: ${String(error)}`;
  });
});

seedButton.addEventListener("click", () => {
  createSampleRecord().catch((error: unknown) => {
    status.textContent = `Create failed: ${String(error)}`;
  });
});

invoke("run_migrations")
  .then(() => refresh())
  .catch((error: unknown) => {
    status.textContent = `Failed to load inventory example: ${String(error)}`;
  });
