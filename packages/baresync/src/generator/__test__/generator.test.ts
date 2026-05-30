import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { defineSyncContract } from "../../schema/contract";
import { defineSyncedTable } from "../../schema/synced-table";
import { computeSyncTableOrder } from "../fk-order";
import { generateSyncArtifacts } from "../index";

const EXTERNAL_REGEX = /external/i;

const merchants = sqliteTable("merchants", {
  id: text("id").primaryKey(),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
  isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
});

const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id),
  name: text("name").notNull(),
  priceMinorUnits: integer("price_minor_units").notNull(),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
  isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
});

const _merchantsSynced = defineSyncedTable({
  table: merchants,
  scope: { source: "scope", field: "id", column: merchants.id },
});

const categoriesSynced = defineSyncedTable({
  table: categories,
  scope: {
    source: "scope",
    field: "merchantId",
    column: categories.merchantId,
  },
  localOnlyColumns: ["isSynced"],
  conflict: { strategy: "last-write-wins", column: categories.updatedAt },
  delete: { mode: "soft", column: categories.deletedAt },
});

const productsSynced = defineSyncedTable({
  table: products,
  scope: { source: "scope", field: "merchantId", column: products.merchantId },
  localOnlyColumns: ["isSynced"],
  conflict: { strategy: "last-write-wins", column: products.updatedAt },
  delete: { mode: "soft", column: products.deletedAt },
});

describe("computeSyncTableOrder", () => {
  it("produces correct upsert/delete order for FK chain", () => {
    const schemaModule = { merchants, categories, products };
    const order = computeSyncTableOrder({
      schemaModule,
      syncedTableNames: ["merchants", "categories", "products"],
    });
    expect(order.upsertOrder).toEqual(["merchants", "categories", "products"]);
    expect(order.deleteOrder).toEqual(["products", "categories", "merchants"]);
  });

  it("orders tables without FKs alphabetically", () => {
    const a = sqliteTable("table_b", {
      id: text("id").primaryKey(),
      deletedAt: text("deleted_at"),
    });
    const b = sqliteTable("table_a", {
      id: text("id").primaryKey(),
      deletedAt: text("deleted_at"),
    });
    const schemaModule = { a, b };
    const order = computeSyncTableOrder({
      schemaModule,
      syncedTableNames: ["table_a", "table_b"],
    });
    expect(order.upsertOrder).toHaveLength(2);
    expect(new Set(order.upsertOrder)).toEqual(new Set(["table_a", "table_b"]));
  });

  it("fails on required FK to non-synced table", () => {
    const external = sqliteTable("external_table", {
      id: text("id").primaryKey(),
    });
    const items = sqliteTable("items", {
      id: text("id").primaryKey(),
      externalId: text("external_id")
        .notNull()
        .references(() => external.id),
      deletedAt: text("deleted_at"),
    });
    const schemaModule = { items, external };
    expect(() =>
      computeSyncTableOrder({
        schemaModule,
        syncedTableNames: ["items"],
      })
    ).toThrow(EXTERNAL_REGEX);
  });

  it("ignores nullable FK to non-synced table", () => {
    const external = sqliteTable("external_table", {
      id: text("id").primaryKey(),
    });
    const orders = sqliteTable("orders", {
      id: text("id").primaryKey(),
      externalRef: text("external_ref").references(() => external.id),
      deletedAt: text("deleted_at"),
    });
    const schemaModule = { orders, external };
    const order = computeSyncTableOrder({
      schemaModule,
      syncedTableNames: ["orders"],
    });
    expect(order.upsertOrder).toEqual(["orders"]);
  });
});

describe("generateSyncArtifacts", () => {
  it("writes sync-contract.json with all required fields", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-test-"));
    const contract = defineSyncContract({
      encoding: "json",
      packageName: "test.sync.v1",
      tables: [categoriesSynced, productsSynced],
    });

    generateSyncArtifacts(contract, tmpDir);

    const jsonPath = path.join(tmpDir, "sync-contract.json");
    expect(fs.existsSync(jsonPath)).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    expect(parsed.version).toBe(1);
    expect(parsed.encoding).toBe("json");
    expect(parsed.packageName).toBe("test.sync.v1");
    expect(parsed.upsertOrder).toEqual(["categories", "products"]);
    expect(parsed.deleteOrder).toEqual(["products", "categories"]);
    expect(parsed.tables).toHaveProperty("categories");
    expect(parsed.tables.categories.localOnlyColumns).toEqual(["isSynced"]);
    expect(parsed.limits.maxPushBytes).toBe(2 * 1024 * 1024);

    const orderPath = path.join(tmpDir, "sync-table-order.ts");
    expect(fs.existsSync(orderPath)).toBe(true);
    const content = fs.readFileSync(orderPath, "utf-8");
    expect(content).toContain("SYNC_UPSERT_ORDER");
    expect(content).toContain("SYNC_DELETE_ORDER");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
