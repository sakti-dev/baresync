import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
      tables: [categoriesSynced, productsSynced],
    });

    generateSyncArtifacts(contract, tmpDir);

    const today = new Date().toISOString().slice(0, 10);
    const jsonPath = path.join(tmpDir, today, "sync-contract.json");
    expect(fs.existsSync(jsonPath)).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    expect(parsed.version).toMatch(ISO_DATE_RE);
    expect(parsed.encoding).toBe("json");
    expect(parsed).not.toHaveProperty("packageName");
    expect(parsed.upsertOrder).toEqual(["categories", "products"]);
    expect(parsed.deleteOrder).toEqual(["products", "categories"]);
    expect(parsed.tables).toHaveProperty("categories");
    expect(parsed.tables.categories.localOnlyColumns).toEqual(["isSynced"]);
    expect(parsed.limits.maxPushBytes).toBe(2 * 1024 * 1024);

    const orderPath = path.join(tmpDir, today, "sync-table-order.ts");
    expect(fs.existsSync(orderPath)).toBe(true);
    const content = fs.readFileSync(orderPath, "utf-8");
    expect(content).toContain("SYNC_UPSERT_ORDER");
    expect(content).toContain("SYNC_DELETE_ORDER");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("uses same date for directory name, contract version, and manifest version", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-test-"));
    const contract = defineSyncContract({
      encoding: "json",
      tables: [categoriesSynced],
    });

    generateSyncArtifacts(contract, tmpDir);

    const subdirs = fs.readdirSync(tmpDir);
    expect(subdirs).toHaveLength(1);
    const dateDir = subdirs[0];
    expect(dateDir).toMatch(ISO_DATE_RE);

    const contractJson = JSON.parse(
      fs.readFileSync(path.join(tmpDir, dateDir, "sync-contract.json"), "utf-8")
    );
    const manifestJson = JSON.parse(
      fs.readFileSync(
        path.join(tmpDir, dateDir, "sync-contract.manifest.json"),
        "utf-8"
      )
    );

    expect(contractJson.version).toBe(dateDir);
    expect(manifestJson.contractVersion).toBe(dateDir);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("overwrites same-day directory on re-generation", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-test-"));
    const contract = defineSyncContract({
      encoding: "json",
      tables: [categoriesSynced],
    });

    generateSyncArtifacts(contract, tmpDir);
    const firstContent = fs.readFileSync(
      path.join(
        tmpDir,
        new Date().toISOString().slice(0, 10),
        "sync-contract.json"
      ),
      "utf-8"
    );

    generateSyncArtifacts(contract, tmpDir);
    const secondContent = fs.readFileSync(
      path.join(
        tmpDir,
        new Date().toISOString().slice(0, 10),
        "sync-contract.json"
      ),
      "utf-8"
    );

    const subdirs = fs.readdirSync(tmpDir);
    expect(subdirs).toHaveLength(1);
    expect(firstContent).toEqual(secondContent);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates new directory for different-day generation without touching old", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-test-"));
    const contract = defineSyncContract({
      encoding: "json",
      tables: [categoriesSynced],
    });

    const day1 = "2025-01-15";
    const day1Dir = path.join(tmpDir, day1);
    fs.mkdirSync(day1Dir, { recursive: true });
    fs.writeFileSync(path.join(day1Dir, "marker.txt"), "old");

    generateSyncArtifacts(contract, tmpDir);

    expect(fs.existsSync(path.join(day1Dir, "marker.txt"))).toBe(true);
    expect(fs.readFileSync(path.join(day1Dir, "marker.txt"), "utf-8")).toBe(
      "old"
    );

    const today = new Date().toISOString().slice(0, 10);
    const todayDir = path.join(tmpDir, today);
    expect(fs.existsSync(todayDir)).toBe(true);
    expect(fs.existsSync(path.join(todayDir, "sync-contract.json"))).toBe(true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("copies schema snapshot files when schemaSourceDir is provided", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-test-"));
    const schemaDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "baresync-schema-")
    );

    fs.writeFileSync(
      path.join(schemaDir, "api-synced-schema.ts"),
      "export const api = true;"
    );
    fs.writeFileSync(
      path.join(schemaDir, "local-synced-schema.ts"),
      "export const local = true;"
    );

    const contract = defineSyncContract({
      encoding: "json",
      tables: [categoriesSynced],
    });

    generateSyncArtifacts({
      contract,
      outputDir: tmpDir,
      schemaSourceDir: schemaDir,
      apiSyncedSchema: {},
      localSyncedSchema: {},
    });

    const today = new Date().toISOString().slice(0, 10);
    const datedDir = path.join(tmpDir, today);

    const apiSnapshot = fs.readFileSync(
      path.join(datedDir, "api-synced-schema.ts"),
      "utf-8"
    );
    const localSnapshot = fs.readFileSync(
      path.join(datedDir, "local-synced-schema.ts"),
      "utf-8"
    );

    expect(apiSnapshot).toBe("export const api = true;");
    expect(localSnapshot).toBe("export const local = true;");

    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(schemaDir, { recursive: true, force: true });
  });

  it("freezes schema snapshot — editing source does not affect generated", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-test-"));
    const schemaDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "baresync-schema-")
    );

    fs.writeFileSync(
      path.join(schemaDir, "api-synced-schema.ts"),
      "export const v1 = true;"
    );
    fs.writeFileSync(
      path.join(schemaDir, "local-synced-schema.ts"),
      "export const local = true;"
    );

    const contract = defineSyncContract({
      encoding: "json",
      tables: [categoriesSynced],
    });

    generateSyncArtifacts({
      contract,
      outputDir: tmpDir,
      schemaSourceDir: schemaDir,
      apiSyncedSchema: {},
      localSyncedSchema: {},
    });

    const today = new Date().toISOString().slice(0, 10);
    const snapshot = fs.readFileSync(
      path.join(tmpDir, today, "api-synced-schema.ts"),
      "utf-8"
    );
    expect(snapshot).toBe("export const v1 = true;");

    fs.writeFileSync(
      path.join(schemaDir, "api-synced-schema.ts"),
      "export const v2 = true;"
    );

    const snapshotAfter = fs.readFileSync(
      path.join(tmpDir, today, "api-synced-schema.ts"),
      "utf-8"
    );
    expect(snapshotAfter).toBe("export const v1 = true;");

    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(schemaDir, { recursive: true, force: true });
  });
});
