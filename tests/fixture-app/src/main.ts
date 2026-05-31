import "./styles.css";
import { invoke } from "@tauri-apps/api/core";
import type { FixtureRowInsert } from "./fixture-schema";
import {
  categories,
  createFixtureSyncClient,
  fixtureDb,
  fixtureScopeId,
  getFixtureRuntimeConfig,
  products,
} from "./fixture-schema";

const state = {
  nextLocalIndex: 1,
  ready: false,
};

let syncClient = createFixtureSyncClient({
  api_url: "http://127.0.0.1:18080",
  encoding: "json",
});

const el = <T extends HTMLElement>(selector: string) =>
  document.querySelector(selector) as T;

const appStatus = el<HTMLElement>("#app-status");
const dbPath = el<HTMLElement>("#db-path");
const dbSize = el<HTMLElement>("#db-size");
const migrationCount = el<HTMLElement>("#migration-count");
const transportMode = el<HTMLElement>("#transport-mode");
const dirtyCount = el<HTMLElement>("#dirty-count");
const watermark = el<HTMLElement>("#watermark");
const needsBaseline = el<HTMLElement>("#needs-baseline");
const syncResult = el<HTMLElement>("#sync-result");
const smokeState = el<HTMLElement>("#smoke-state");
const categoriesList = el<HTMLUListElement>("#categories-list");
const productsList = el<HTMLUListElement>("#products-list");
const buttons = {
  baseline: el<HTMLButtonElement>("#baseline-sync"),
  create: el<HTMLButtonElement>("#create-row"),
  sync: el<HTMLButtonElement>("#manual-sync"),
  reset: el<HTMLButtonElement>("#reset-state"),
  refresh: el<HTMLButtonElement>("#refresh-state"),
};

function setBusy(isBusy: boolean) {
  for (const button of Object.values(buttons)) {
    button.disabled = isBusy;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function renderList(
  list: HTMLUListElement,
  rows: Record<string, unknown>[],
  emptyLabel: string
) {
  list.replaceChildren();
  if (rows.length === 0) {
    const li = document.createElement("li");
    li.className = "status-line";
    li.textContent = emptyLabel;
    list.appendChild(li);
    return;
  }

  for (const row of rows) {
    const li = document.createElement("li");
    const plainRow = Object.fromEntries(
      Reflect.ownKeys(row)
        .filter((key): key is string => typeof key === "string")
        .map((key) => [key, row[key]])
    );
    li.textContent = JSON.stringify(plainRow);
    list.appendChild(li);
  }
}

async function ensureMigrations() {
  await invoke("run_migrations");
}

function sqlRowToObject(row: { columns: string[]; values: unknown[] }) {
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
  })) as Array<{ columns: string[]; values: unknown[] }>;

  return rows.map(sqlRowToObject) as Record<string, unknown>[];
}

async function refreshStatus() {
  const [dbInfo, migrationStatus, localState, categoryRows, productRows] =
    await Promise.all([
      invoke<{ db_path: string; size_bytes: number; size_formatted: string }>(
        "get_db_info"
      ),
      invoke<Array<{ hash: string; created_at: number }>>(
        "get_migration_status"
      ),
      syncClient.getState(),
      queryRows(
        "SELECT id, merchant_id, name, sort_order, deleted_at, is_synced, created_at, updated_at FROM categories ORDER BY updated_at DESC"
      ),
      queryRows(
        "SELECT id, merchant_id, category_id, name, price_minor_units, deleted_at, is_synced, created_at, updated_at FROM products ORDER BY updated_at DESC"
      ),
    ]);

  dbPath.textContent = dbInfo.db_path;
  dbSize.textContent = dbInfo.size_formatted;
  migrationCount.textContent = String(migrationStatus.length);
  dirtyCount.textContent = String(localState.local_dirty_count);
  watermark.textContent = localState.last_server_watermark || "-";
  needsBaseline.textContent = localState.needs_baseline_sync ? "yes" : "no";
  smokeState.textContent = [
    `dirty:${localState.local_dirty_count}`,
    categoryRows.some((row) => row.name === "Drinks") ? "cat:Drinks" : null,
    productRows.some((row) => row.name === "Kopi Susu")
      ? "prod:Kopi Susu"
      : null,
    categoryRows.some((row) => row.name === "Fixture Category 001")
      ? "cat:Fixture Category 001"
      : null,
    productRows.some((row) => row.name === "Fixture Product 001")
      ? "prod:Fixture Product 001"
      : null,
    categoryRows.some(
      (row) => row.id === "local-cat-001" && row.is_synced === 1
    )
      ? "cat:local-cat-001:synced"
      : null,
    productRows.some(
      (row) => row.id === "local-prod-001" && row.is_synced === 1
    )
      ? "prod:local-prod-001:synced"
      : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" ");
  renderList(categoriesList, categoryRows, "No categories yet.");
  renderList(productsList, productRows, "No products yet.");
  appStatus.textContent = "ready";
}

function buildFixtureInsert(): FixtureRowInsert {
  const index = state.nextLocalIndex++;
  const suffix = String(index).padStart(3, "0");
  const timestamp = nowIso();
  return {
    categoryId: `local-cat-${suffix}`,
    productId: `local-prod-${suffix}`,
    categoryName: `Fixture Category ${suffix}`,
    productName: `Fixture Product ${suffix}`,
    priceMinorUnits: 12_000 + index * 500,
    timestamp,
  };
}

async function createLocalRow() {
  const row = buildFixtureInsert();
  await fixtureDb.insert(categories).values({
    id: row.categoryId,
    merchantId: fixtureScopeId,
    name: row.categoryName,
    sortOrder: 100 + state.nextLocalIndex,
    deletedAt: null,
    isSynced: false,
    createdAt: row.timestamp,
    updatedAt: row.timestamp,
  });
  await invoke("run_sql_batch", {
    statements: [
      {
        sql: "INSERT INTO sync_outbox (id, table_name, row_id, operation, payload, scope_id, changed_at, synced_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL)",
        params: [
          `outbox-${row.categoryId}`,
          "categories",
          row.categoryId,
          "insert",
          JSON.stringify({
            id: row.categoryId,
            merchantId: fixtureScopeId,
            name: row.categoryName,
            sortOrder: 100 + state.nextLocalIndex,
            deletedAt: null,
            isSynced: false,
            createdAt: row.timestamp,
            updatedAt: row.timestamp,
          }),
          fixtureScopeId,
          row.timestamp,
        ],
      },
    ],
  });
  await fixtureDb.insert(products).values({
    id: row.productId,
    merchantId: fixtureScopeId,
    categoryId: row.categoryId,
    name: row.productName,
    priceMinorUnits: row.priceMinorUnits,
    deletedAt: null,
    isSynced: false,
    createdAt: row.timestamp,
    updatedAt: row.timestamp,
  });
  await invoke("run_sql_batch", {
    statements: [
      {
        sql: "INSERT INTO sync_outbox (id, table_name, row_id, operation, payload, scope_id, changed_at, synced_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL)",
        params: [
          `outbox-${row.productId}`,
          "products",
          row.productId,
          "insert",
          JSON.stringify({
            id: row.productId,
            merchantId: fixtureScopeId,
            categoryId: row.categoryId,
            name: row.productName,
            priceMinorUnits: row.priceMinorUnits,
            deletedAt: null,
            isSynced: false,
            createdAt: row.timestamp,
            updatedAt: row.timestamp,
          }),
          fixtureScopeId,
          row.timestamp,
        ],
      },
    ],
  });

  syncResult.textContent = `created ${row.categoryId} and ${row.productId}`;
  await refreshStatus();
}

async function runSync(kind: "baseline" | "manual") {
  const result = await syncClient.syncNow();
  syncResult.textContent = `${kind}: ${JSON.stringify(result)}`;
  await refreshStatus();
}

async function resetFixtureState() {
  await invoke("reset_fixture_state");
  state.nextLocalIndex = 1;
  syncResult.textContent = "local state reset";
  await refreshStatus();
}

async function bootstrap() {
  setBusy(true);
  try {
    const runtimeConfig = await getFixtureRuntimeConfig();
    syncClient = createFixtureSyncClient(runtimeConfig);
    transportMode.textContent = runtimeConfig.encoding;
    await ensureMigrations();
    await refreshStatus();
    state.ready = true;
  } finally {
    setBusy(false);
  }
}

buttons.baseline.addEventListener("click", async () => {
  setBusy(true);
  try {
    await runSync("baseline");
  } finally {
    setBusy(false);
  }
});

buttons.create.addEventListener("click", async () => {
  setBusy(true);
  try {
    await createLocalRow();
  } finally {
    setBusy(false);
  }
});

buttons.sync.addEventListener("click", async () => {
  setBusy(true);
  try {
    await runSync("manual");
  } finally {
    setBusy(false);
  }
});

buttons.reset.addEventListener("click", async () => {
  setBusy(true);
  try {
    await resetFixtureState();
  } finally {
    setBusy(false);
  }
});

buttons.refresh.addEventListener("click", async () => {
  setBusy(true);
  try {
    await refreshStatus();
  } finally {
    setBusy(false);
  }
});

bootstrap().catch((error) => {
  console.error("fixture bootstrap failed:", error);
  appStatus.textContent = "error";
  syncResult.textContent =
    error instanceof Error ? error.message : String(error);
});
