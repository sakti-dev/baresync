import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  blob,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
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

const media = sqliteTable("media", {
  id: text("id").primaryKey(),
  scopeId: text("scope_id").notNull(),
  title: text("title").notNull(),
  rating: real("rating").notNull(),
  payload: blob("payload").notNull(),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
  isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
});

const scalarContract = defineSyncContract({
  encoding: "protobuf",
  packageName: "test.sync.v1",
  tables: [
    defineSyncedTable({
      table: media,
      scope: {
        source: "scope",
        field: "scopeId",
        column: media.scopeId,
      },
      localOnlyColumns: ["isSynced"],
      conflict: { strategy: "last-write-wins", column: media.updatedAt },
      delete: { mode: "soft", column: media.deletedAt },
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
    expect(rustRuntime).toContain("pub struct GeneratedProtobufTransport");
    expect(rustRuntime).toContain("fn push_request_from_value");
    expect(rustRuntime).toContain("fn pull_request_from_value");
    expect(rustRuntime).toContain("fn status_request_from_value");
    expect(rustRuntime).toContain("fn optional_bool_field");
    expect(rustRuntime).toContain("#[derive(Debug, Clone)]");
    expect(rustRuntime).toContain(
      "impl Default for GeneratedProtobufTransport"
    );
    expect(rustRuntime).toContain("client: reqwest::Client");
    expect(rustRuntime).toContain("const PROTOBUF_CONTENT_TYPE: &str");
    expect(rustRuntime).toContain(
      'is_synced: optional_bool_field(obj, "isSynced")?.unwrap_or(false),'
    );
    expect(rustRuntime).not.toContain(
      'is_synced: bool_field(obj, "categories", "isSynced")?,'
    );
    expect(rustRuntime).not.toContain("value.as_f64()");

    const tableOrder = fs.readFileSync(
      path.join(tmpDir, "sync-table-order.ts"),
      "utf-8"
    );
    expect(tableOrder).toContain("SYNC_UPSERT_ORDER");
    expect(tableOrder).toContain("SYNC_DELETE_ORDER");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("renders row mappers for string, bool, int64, double, bytes, and deleted metadata fields", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-proto-"));
    const rustPath = path.join(tmpDir, "rust", "protobuf_generated.rs");

    generateProtobufWorkspaceArtifacts({
      contract: scalarContract,
      outputDir: tmpDir,
      outputs: {
        proto: path.join(tmpDir, "proto", "sync.proto"),
        runtimeSourceTs: path.join(tmpDir, "runtime.ts"),
        runtimeTs: path.join(tmpDir, "runtime.generated.ts"),
        rustSyncMappers: rustPath,
        syncTs: path.join(tmpDir, "sync.generated.ts"),
      },
    });

    const rustRuntime = fs.readFileSync(rustPath, "utf-8");
    expect(rustRuntime).toContain("fn f64_field");
    expect(rustRuntime).toContain("fn bytes_field");
    expect(rustRuntime).toContain("fn optional_i64_field");
    expect(rustRuntime).toContain("fn optional_f64_field");
    expect(rustRuntime).toContain("fn optional_bytes_field");
    expect(rustRuntime).toContain("fn bytes_to_value");
    expect(rustRuntime).toContain("fn optional_string_field(");
    expect(rustRuntime).toContain(") -> Result<String, SyncError> {");
    expect(rustRuntime).toContain(
      'Some(_) => Err(field_missing(table, field, "string")),'
    );
    expect(rustRuntime).toContain("deletedAt");
    expect(rustRuntime).toContain("rating");
    expect(rustRuntime).toContain("payload");
    expect(rustRuntime).toContain("pub struct GeneratedProtobufTransport");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
