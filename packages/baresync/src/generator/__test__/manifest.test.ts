import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { defineSyncContract } from "../../schema/contract";
import { defineSyncedTable } from "../../schema/synced-table";
import { generateSyncArtifacts } from "../index";
import type { SyncManifest } from "../manifest";

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

const categoriesSynced = defineSyncedTable({
  table: categories,
  scope: {
    source: "scope",
    field: "merchantId",
    column: categories.merchantId,
  },
  conflict: { strategy: "last-write-wins", column: categories.updatedAt },
  delete: { mode: "soft", column: categories.deletedAt },
});

const productsSynced = defineSyncedTable({
  table: products,
  scope: {
    source: "scope",
    field: "merchantId",
    column: products.merchantId,
  },
  conflict: { strategy: "last-write-wins", column: products.updatedAt },
  delete: { mode: "soft", column: products.deletedAt },
});

describe("writeManifest", () => {
  it("writes manifest with correct structure", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-test-"));
    const contract = defineSyncContract({
      encoding: "json",
      packageName: "test.manifest.v1",
      tables: [categoriesSynced, productsSynced],
    });

    generateSyncArtifacts(contract, tmpDir);

    const manifestPath = path.join(tmpDir, "sync-contract.manifest.json");
    expect(fs.existsSync(manifestPath)).toBe(true);

    const raw = fs.readFileSync(manifestPath, "utf-8");
    const manifest: SyncManifest = JSON.parse(raw);

    expect(manifest.contractVersion).toBe(1);
    expect(manifest.generatorVersion).toBe("0.1.0");
    expect(manifest.encoding).toBe("json");
    expect(manifest.packageName).toBe("test.manifest.v1");
    expect(manifest.tables).toHaveLength(2);
    expect(manifest.tables.map((t) => t.name)).toEqual([
      "categories",
      "products",
    ]);
    expect(manifest.scopeMappings).toHaveLength(2);
    expect(manifest.scopeMappings[0]).toEqual({
      table: "categories",
      field: "merchantId",
    });
    expect(manifest.outputPaths).toContain("sync-contract.json");
    expect(manifest.outputPaths).toContain("sync-contract.manifest.json");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reflects FK analysis in tableOrder", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-test-"));
    const contract = defineSyncContract({
      encoding: "json",
      packageName: "test.manifest.v1",
      tables: [categoriesSynced, productsSynced],
    });

    generateSyncArtifacts(contract, tmpDir);

    const manifestPath = path.join(tmpDir, "sync-contract.manifest.json");
    const manifest: SyncManifest = JSON.parse(
      fs.readFileSync(manifestPath, "utf-8")
    );

    expect(manifest.tableOrder.upsert).toEqual(["categories", "products"]);
    expect(manifest.tableOrder.delete).toEqual(["products", "categories"]);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("manifest tables contain field lists", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-test-"));
    const contract = defineSyncContract({
      encoding: "json",
      packageName: "test.manifest.v1",
      tables: [categoriesSynced],
    });

    generateSyncArtifacts(contract, tmpDir);

    const manifestPath = path.join(tmpDir, "sync-contract.manifest.json");
    const manifest: SyncManifest = JSON.parse(
      fs.readFileSync(manifestPath, "utf-8")
    );

    const catTable = manifest.tables.find((t) => t.name === "categories");
    expect(catTable).toBeDefined();
    expect(catTable!.fields).toContain("id");
    expect(catTable!.fields).toContain("merchant_id");
    expect(catTable!.fields).toContain("deleted_at");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
