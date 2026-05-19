import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { defineSyncContract } from "../../schema/contract";
import { defineSyncedTable } from "../../schema/synced-table";
import { generateProtobufWorkspaceArtifacts } from "../index";

const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
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

const contract = defineSyncContract({
  encoding: "protobuf",
  packageName: "test.sync.v1",
  tables: [
    defineSyncedTable({
      table: categories,
      scope: {
        source: "scope",
        field: "merchantId",
        column: categories.merchantId,
      },
      localOnlyColumns: ["isSynced"],
      conflict: { strategy: "last-write-wins", column: categories.updatedAt },
      delete: { mode: "soft", column: categories.deletedAt },
    }),
    defineSyncedTable({
      table: products,
      scope: {
        source: "scope",
        field: "merchantId",
        column: products.merchantId,
      },
      localOnlyColumns: ["isSynced"],
      conflict: { strategy: "last-write-wins", column: products.updatedAt },
      delete: { mode: "soft", column: products.deletedAt },
    }),
  ],
});

describe("generateProtobufWorkspaceArtifacts", () => {
  it("writes protobuf workspace outputs from the config-driven contract", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-proto-"));
    const protoPath = path.join(tmpDir, "proto", "sync.proto");
    const runtimeSourcePath = path.join(tmpDir, "runtime.ts");
    const runtimePath = path.join(tmpDir, "runtime.generated.ts");
    const tsPath = path.join(tmpDir, "sync.generated.ts");
    const rustPath = path.join(tmpDir, "rust", "protobuf_generated.rs");

    generateProtobufWorkspaceArtifacts({
      contract,
      outputDir: tmpDir,
      outputs: {
        proto: protoPath,
        runtimeSourceTs: runtimeSourcePath,
        rustSyncMappers: rustPath,
        runtimeTs: runtimePath,
        syncTs: tsPath,
      },
    });

    expect(fs.existsSync(path.join(tmpDir, "sync-contract.json"))).toBe(true);
    expect(fs.existsSync(protoPath)).toBe(true);
    expect(fs.existsSync(runtimeSourcePath)).toBe(true);
    expect(fs.existsSync(runtimePath)).toBe(true);
    expect(fs.existsSync(tsPath)).toBe(true);
    expect(fs.existsSync(rustPath)).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "sync-table-order.ts"))).toBe(true);

    const proto = fs.readFileSync(protoPath, "utf-8");
    expect(proto).toContain('syntax = "proto3";');
    expect(proto).toContain("message SyncPushBatchRequest");
    expect(proto).toContain("message CategoriesRow");

    const tsRuntime = fs.readFileSync(tsPath, "utf-8");
    expect(tsRuntime).toContain("SYNC_PROTOBUF_SCHEMA");
    expect(tsRuntime).toContain("categories");

    const runtimeSource = fs.readFileSync(runtimeSourcePath, "utf-8");
    expect(runtimeSource).toContain("decodeProtobufBody");
    expect(runtimeSource).toContain("SyncTableAck");

    const runtimeWrapper = fs.readFileSync(runtimePath, "utf-8");
    expect(runtimeWrapper).toContain("decodeProtobufBody");
    expect(runtimeWrapper).toContain("SYNC_PROTOBUF_SCHEMA");

    const rustRuntime = fs.readFileSync(rustPath, "utf-8");
    expect(rustRuntime).toContain("pub struct SyncPushBatchRequest");
    expect(rustRuntime).toContain("pub struct CategoriesRow");

    const tableOrder = fs.readFileSync(
      path.join(tmpDir, "sync-table-order.ts"),
      "utf-8"
    );
    expect(tableOrder).toContain("SYNC_UPSERT_ORDER");
    expect(tableOrder).toContain("SYNC_DELETE_ORDER");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
