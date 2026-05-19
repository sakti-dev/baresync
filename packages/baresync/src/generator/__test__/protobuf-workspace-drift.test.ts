import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  packageName: "baresync.sync.v1",
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

function readText(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(
  here,
  "../../../../../tests/e2e/generated/protobuf"
);
const rustRoot = path.resolve(here, "../../../../../crates/baresync-core/src");

describe("protobuf workspace drift", () => {
  it("matches the checked-in generated protobuf workspace outputs", () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "baresync-proto-drift-")
    );
    try {
      const tempConfig = {
        contract,
        outputDir: tmpDir,
        outputs: {
          proto: path.join(tmpDir, "proto", "sync.proto"),
          runtimeSourceTs: path.join(tmpDir, "runtime.ts"),
          rustSyncMappers: path.join(tmpDir, "rust", "protobuf_generated.rs"),
          runtimeTs: path.join(tmpDir, "runtime.generated.ts"),
          syncTs: path.join(tmpDir, "sync.generated.ts"),
        },
      };

      generateProtobufWorkspaceArtifacts(tempConfig);

      expect(
        readText(path.join(tempConfig.outputDir, "sync-contract.json"))
      ).toBe(readText(path.join(packageRoot, "sync-contract.json")));
      expect(
        readText(path.join(tempConfig.outputDir, "sync-table-order.ts"))
      ).toBe(readText(path.join(packageRoot, "sync-table-order.ts")));
      expect(readText(tempConfig.outputs.proto)).toBe(
        readText(path.join(packageRoot, "proto", "sync.proto"))
      );
      expect(readText(tempConfig.outputs.runtimeSourceTs)).toBe(
        readText(path.join(packageRoot, "runtime.ts"))
      );
      expect(readText(tempConfig.outputs.runtimeTs)).toBe(
        readText(path.join(packageRoot, "runtime.generated.ts"))
      );
      expect(readText(tempConfig.outputs.syncTs)).toBe(
        readText(path.join(packageRoot, "sync.generated.ts"))
      );
      expect(readText(tempConfig.outputs.rustSyncMappers)).toBe(
        readText(path.join(rustRoot, "protobuf_generated.rs"))
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
