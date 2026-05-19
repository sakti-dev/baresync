import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { defineSyncContract, syncSchema } from "../contract";
import { defineSyncedTable, syncedTable } from "../synced-table";

const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

const categoriesSynced = defineSyncedTable({
  table: categories,
  scope: {
    source: "scope",
    field: "merchantId",
    column: categories.merchantId,
  },
  localOnlyColumns: ["isSynced"],
});

describe("defineSyncedTable", () => {
  it("returns definition with scope metadata", () => {
    const def = defineSyncedTable({
      table: categories,
      scope: {
        source: "scope",
        field: "merchantId",
        column: categories.merchantId,
      },
    });
    expect(def.scope.field).toBe("merchantId");
    expect(def.table).toBe(categories);
    expect(def.localOnlyColumns).toBeUndefined();
  });

  it("records local-only columns", () => {
    const def = defineSyncedTable({
      table: categories,
      scope: {
        source: "scope",
        field: "merchantId",
        column: categories.merchantId,
      },
      localOnlyColumns: ["isSynced"],
    });
    expect(def.localOnlyColumns).toEqual(["isSynced"]);
  });
});

describe("syncedTable", () => {
  it("resolves scope from string name", () => {
    const def = syncedTable(categories, { scope: "merchant_id" });
    expect(def.scope.field).toBe("merchantId");
  });

  it("throws when scope column not found", () => {
    expect(() => syncedTable(categories, { scope: "nonexistent" })).toThrow(
      'Scope column "nonexistent" not found'
    );
  });
});

describe("defineSyncContract validation", () => {
  it("creates contract with valid tables", () => {
    const contract = defineSyncContract({
      encoding: "json",
      packageName: "test.sync.v1",
      tables: [categoriesSynced],
    });
    expect(contract.encoding).toBe("json");
    expect(contract.packageName).toBe("test.sync.v1");
    expect(contract.tables).toHaveLength(1);
    expect(contract.limits.maxPushBytes).toBe(2 * 1024 * 1024);
    expect(contract.limits.maxPushRows).toBe(2000);
  });

  it("rejects protobuf encoding in this version", () => {
    expect(() =>
      defineSyncContract({
        encoding: "protobuf",
        packageName: "test.sync.v1",
        tables: [categoriesSynced],
      })
    ).toThrow('Unsupported encoding "protobuf"');
  });

  it("uses custom limits", () => {
    const contract = defineSyncContract({
      encoding: "json",
      packageName: "test.sync.v1",
      tables: [categoriesSynced],
      limits: { maxPushBytes: 1024 },
    });
    expect(contract.limits.maxPushBytes).toBe(1024);
    expect(contract.limits.maxPushRows).toBe(2000);
  });
});

describe("syncSchema", () => {
  it("uses default encoding and limits", () => {
    const contract = syncSchema({
      packageName: "test.sync.v1",
      tables: [categoriesSynced],
    });
    expect(contract.encoding).toBe("json");
    expect(contract.limits.maxPushBytes).toBe(2 * 1024 * 1024);
  });
});

describe("structural validation", () => {
  it("fails when table has no id primary key", () => {
    const noId = sqliteTable("no_id", {
      merchantId: text("merchant_id").notNull(),
      deletedAt: text("deleted_at"),
    });
    const def = defineSyncedTable({
      table: noId,
      scope: {
        source: "scope",
        field: "merchantId",
        column: noId.merchantId,
      },
    });
    expect(() =>
      defineSyncContract({
        encoding: "json",
        packageName: "test",
        tables: [def],
      })
    ).toThrow('missing a primary key column "id"');
  });

  it("fails when scope field is missing", () => {
    const noScope = sqliteTable("no_scope", {
      id: text("id").primaryKey(),
      deletedAt: text("deleted_at"),
    });
    const def = defineSyncedTable({
      table: noScope,
      scope: {
        source: "scope",
        field: "merchantId",
        column: (noScope as unknown as { id: unknown })
          .id as import("drizzle-orm/sqlite-core").SQLiteColumn,
      },
    });
    expect(() =>
      defineSyncContract({
        encoding: "json",
        packageName: "test",
        tables: [def],
      })
    ).toThrow('scope field "merchantId" does not map');
  });

  it("fails when deleted_at is missing", () => {
    const noDeleted = sqliteTable("no_deleted", {
      id: text("id").primaryKey(),
      merchantId: text("merchant_id").notNull(),
    });
    const def = defineSyncedTable({
      table: noDeleted,
      scope: {
        source: "scope",
        field: "merchantId",
        column: noDeleted.merchantId,
      },
    });
    expect(() =>
      defineSyncContract({
        encoding: "json",
        packageName: "test",
        tables: [def],
      })
    ).toThrow('missing "deleted_at"');
  });
});
