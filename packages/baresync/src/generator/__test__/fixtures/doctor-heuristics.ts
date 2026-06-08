import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { SyncContract } from "../../../schema/contract";
import { defineSyncContract } from "../../../schema/contract";
import { defineSyncedTable } from "../../../schema/synced-table";

const customerLocal = sqliteTable("customers", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

const customerApi = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull(),
    name: text("name").notNull(),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
    isSynced: integer("is_synced", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (table) => [
    index("customers_scope_sync_idx").on(table.merchantId, table.syncUpdatedAt),
  ]
);

const orderLocal = sqliteTable("orders", {
  id: text("id").primaryKey(),
  locationId: text("location_id").notNull(),
  totalMinorUnits: integer("total_minor_units").notNull(),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

const orderApi = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    locationId: text("location_id").notNull(),
    totalMinorUnits: integer("total_minor_units").notNull(),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
    isSynced: integer("is_synced", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (table) => [
    index("orders_scope_sync_idx").on(
      table.locationId,
      table.syncUpdatedAt,
      table.id
    ),
  ]
);

const inventoryLocal = sqliteTable("inventory_items", {
  id: text("id").primaryKey(),
  warehouseId: text("warehouse_id").notNull(),
  sku: text("sku").notNull(),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

const inventoryApi = sqliteTable("inventory_items", {
  id: text("id").primaryKey(),
  warehouseId: text("warehouse_id").notNull(),
  sku: text("sku").notNull(),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
  isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
});

const catalogLocal = sqliteTable("catalog_entries", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  title: text("title").notNull(),
  draftState: text("draft_state"),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

const catalogApi = sqliteTable(
  "catalog_entries",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    title: text("title").notNull(),
    serverRevision: text("server_revision"),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
    isSynced: integer("is_synced", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (table) => [
    index("catalog_entries_scope_sync_idx").on(
      table.tenantId,
      table.syncUpdatedAt
    ),
  ]
);

export const doctorHeuristicsFixtures = {
  apiTables: {
    catalogEntries: catalogApi,
    customers: customerApi,
    inventoryItems: inventoryApi,
    orders: orderApi,
  },
  localTables: {
    catalogEntries: catalogLocal,
    customers: customerLocal,
    inventoryItems: inventoryLocal,
    orders: orderLocal,
  },
} as const;

export function buildDoctorHeuristicsContract(): SyncContract {
  return defineSyncContract({
    tables: [
      defineSyncedTable({
        table: customerLocal,
        scope: {
          source: "scope",
          field: "merchantId",
          column: customerLocal.merchantId,
        },
        localOnlyColumns: ["isSynced"],
        serverOnlyColumns: ["syncUpdatedAt"],
      }),
      defineSyncedTable({
        table: orderLocal,
        scope: {
          source: "scope",
          field: "locationId",
          column: orderLocal.locationId,
        },
        localOnlyColumns: ["isSynced"],
        serverOnlyColumns: ["syncUpdatedAt"],
      }),
      defineSyncedTable({
        table: inventoryLocal,
        scope: {
          source: "scope",
          field: "warehouseId",
          column: inventoryLocal.warehouseId,
        },
        localOnlyColumns: ["isSynced"],
        serverOnlyColumns: ["syncUpdatedAt"],
      }),
      defineSyncedTable({
        table: catalogLocal,
        scope: {
          source: "scope",
          field: "tenantId",
          column: catalogLocal.tenantId,
        },
        localOnlyColumns: ["isSynced", "draftState"],
        serverOnlyColumns: ["syncUpdatedAt", "serverRevision"],
      }),
    ],
  });
}
