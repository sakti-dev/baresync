import {
  getTableConfig,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { defineSyncContract, syncSchema } from "../contract";
import { createSyncCursorsTable, createSyncOutboxTable } from "../local-schema";
import { apiSyncColumns, localSyncColumns } from "../row-state";
import { createSyncBatchRequestsTable } from "../server-schema";
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

describe("sync column helpers", () => {
  it("adds supported local sync columns to a Drizzle table", () => {
    const localItems = sqliteTable("local_items", {
      id: text("id").primaryKey(),
      scopeId: text("scope_id").notNull(),
      ...localSyncColumns(),
    });

    const columns = getTableConfig(localItems).columns.map((c) => c.name);

    expect(columns).toContain("deleted_at");
    expect(columns).toContain("created_at");
    expect(columns).toContain("updated_at");
    expect(columns).toContain("is_synced");
  });

  it("adds supported API sync columns to a Drizzle table", () => {
    const apiItems = sqliteTable("api_items", {
      id: text("id").primaryKey(),
      scopeId: text("scope_id").notNull(),
      ...apiSyncColumns(),
    });

    const columns = getTableConfig(apiItems).columns.map((c) => c.name);

    expect(columns).toContain("deleted_at");
    expect(columns).toContain("created_at");
    expect(columns).toContain("updated_at");
    expect(columns).toContain("sync_updated_at");
  });
});

describe("sync framework table helpers", () => {
  it("creates the canonical local outbox table", () => {
    const outbox = createSyncOutboxTable();
    const config = getTableConfig(outbox);
    const columns = config.columns.map((column) => column.name);
    const indexes = config.indexes.map((index) => index.config.name);

    expect(config.name).toBe("sync_outbox");
    expect(columns).toEqual([
      "id",
      "table_name",
      "row_id",
      "operation",
      "payload",
      "scope_id",
      "changed_at",
      "synced_at",
    ]);
    expect(indexes).toContain("sync_outbox_pending_row_unique");
  });

  it("creates the canonical local cursors table", () => {
    const cursors = createSyncCursorsTable();
    const config = getTableConfig(cursors);
    const columns = config.columns.map((column) => column.name);

    expect(config.name).toBe("sync_cursors");
    expect(columns).toEqual(["id", "scope_id", "last_cursor", "updated_at"]);
  });

  it("creates the canonical server idempotency table", () => {
    const requests = createSyncBatchRequestsTable();
    const config = getTableConfig(requests);
    const columns = config.columns.map((column) => column.name);
    const indexes = config.indexes.map((index) => index.config.name);

    expect(config.name).toBe("sync_batch_requests");
    expect(columns).toEqual([
      "id",
      "client_id",
      "idempotency_key",
      "request_hash",
      "status",
      "response_body",
      "created_at",
      "completed_at",
    ]);
    expect(indexes).toContain("sync_batch_requests_client_idemp_idx");
  });
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
      tables: [categoriesSynced],
    });
    expect(contract.encoding).toBe("json");
    expect(contract.tables).toHaveLength(1);
    expect(contract.limits.maxPushBytes).toBe(2 * 1024 * 1024);
    expect(contract.limits.maxPushRows).toBe(2000);
  });

  it("uses custom limits", () => {
    const contract = defineSyncContract({
      encoding: "json",

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

        tables: [def],
      })
    ).toThrow('missing "deleted_at"');
  });
});
