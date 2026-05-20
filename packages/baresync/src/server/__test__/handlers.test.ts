import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { describe, expect, it, vi } from "vitest";
import {
  decodeProtobufBody,
  encodeProtobufBody,
  type SyncProtobufSchema,
} from "../../../../../tests/e2e/generated/protobuf/runtime.generated";
import { defineSyncContract } from "../../schema/contract";
import { defineSyncedTable } from "../../schema/synced-table";
import {
  createSyncPullHandler,
  createSyncPushHandler,
  createSyncStatusHandler,
} from "../handlers";

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
  scope: {
    source: "scope",
    field: "merchantId",
    column: products.merchantId,
  },
  localOnlyColumns: ["isSynced"],
  conflict: { strategy: "last-write-wins", column: products.updatedAt },
  delete: { mode: "soft", column: products.deletedAt },
});

function createTestDb(): SqliteRemoteDatabase {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE sync_batch_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      status TEXT NOT NULL,
      response_body TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      UNIQUE(client_id, idempotency_key)
    )
  `);
  return drizzle(sqlite) as unknown as SqliteRemoteDatabase;
}

function createJsonRequest(body: unknown): Request {
  return new Request("http://localhost/sync", {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

function createProtobufRequest(bytes: Uint8Array): Request {
  return new Request("http://localhost/sync", {
    body: bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer,
    headers: {
      "Content-Type": "application/x-protobuf",
    },
    method: "POST",
  });
}

function authorizedScope<TScope>(scope: TScope) {
  return { ok: true as const, scope };
}

function unauthorizedScope(body: unknown, status: number) {
  return { body, ok: false as const, status };
}

function createProtobufSchema(): SyncProtobufSchema {
  const contract = defineSyncContract({
    encoding: "protobuf",
    packageName: "test.sync.v1",
    tables: [categoriesSynced, productsSynced],
  });

  return {
    packageName: contract.packageName,
    tables: {
      categories: {
        changesMessageName: "CategoriesChanges",
        fields: [
          { fieldNumber: 1, name: "id", protobufType: "string" },
          { fieldNumber: 2, name: "merchantId", protobufType: "string" },
          { fieldNumber: 3, name: "name", protobufType: "string" },
          { fieldNumber: 4, name: "sortOrder", protobufType: "int64" },
          { fieldNumber: 5, name: "deletedAt", protobufType: "string" },
          { fieldNumber: 6, name: "createdAt", protobufType: "string" },
          { fieldNumber: 7, name: "updatedAt", protobufType: "string" },
          { fieldNumber: 8, name: "syncUpdatedAt", protobufType: "int64" },
          { fieldNumber: 9, name: "isSynced", protobufType: "bool" },
        ],
        requestFieldNumber: 4,
        rowMessageName: "CategoriesRow",
        wrapperFieldNumbers: { changedRows: 1, deletedIds: 2 },
      },
      products: {
        changesMessageName: "ProductsChanges",
        fields: [
          { fieldNumber: 1, name: "id", protobufType: "string" },
          { fieldNumber: 2, name: "merchantId", protobufType: "string" },
          { fieldNumber: 3, name: "categoryId", protobufType: "string" },
          { fieldNumber: 4, name: "name", protobufType: "string" },
          { fieldNumber: 5, name: "priceMinorUnits", protobufType: "int64" },
          { fieldNumber: 6, name: "deletedAt", protobufType: "string" },
          { fieldNumber: 7, name: "createdAt", protobufType: "string" },
          { fieldNumber: 8, name: "updatedAt", protobufType: "string" },
          { fieldNumber: 9, name: "syncUpdatedAt", protobufType: "int64" },
          { fieldNumber: 10, name: "isSynced", protobufType: "bool" },
        ],
        requestFieldNumber: 5,
        rowMessageName: "ProductsRow",
        wrapperFieldNumbers: { changedRows: 1, deletedIds: 2 },
      },
    },
    tableOrder: {
      delete: ["products", "categories"],
      upsert: ["categories", "products"],
    },
  };
}

describe("createSyncPushHandler", () => {
  it("applies authorized push changes in contract order", async () => {
    const db = createTestDb();
    const handler = createSyncPushHandler<
      { sessionId: string },
      { merchantId: string }
    >({
      applyPushChanges: vi.fn(async (input) => ({
        acceptedTables: input.changes.map(
          (change: { table: string }) => change.table
        ),
        scopeId: input.scopeId,
        serverTime: "2026-05-20T00:00:00.000Z",
      })),
      encoding: "json",
      idempotency: { db },
      resolveScope: vi.fn(async ({ scopeId }) =>
        authorizedScope({ merchantId: scopeId })
      ),
      upsertOrder: ["categories", "products"],
    });

    const response = await handler(
      createJsonRequest({
        scopeId: "merchant-1",
        clientId: "client-1",
        idempotencyKey: "idem-1",
        tables: [
          { table: "products", changedRows: [{ id: "p1" }], deletedIds: [] },
          { table: "categories", changedRows: [{ id: "c1" }], deletedIds: [] },
        ],
      }),
      { sessionId: "session-1" }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      acceptedTables: ["categories", "products"],
      scopeId: "merchant-1",
      serverTime: "2026-05-20T00:00:00.000Z",
    });
  });

  it("returns the authorization response without calling applyPushChanges", async () => {
    const db = createTestDb();
    const applyPushChanges = vi.fn();
    const handler = createSyncPushHandler<
      { sessionId: string },
      { merchantId: string }
    >({
      applyPushChanges,
      encoding: "json",
      idempotency: { db },
      resolveScope: vi.fn(async () =>
        unauthorizedScope({ error: "forbidden" }, 403)
      ),
      upsertOrder: ["categories", "products"],
    });

    const response = await handler(
      createJsonRequest({
        scopeId: "merchant-1",
        clientId: "client-1",
        idempotencyKey: "idem-1",
        tables: [],
      }),
      { sessionId: "session-1" }
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
    expect(applyPushChanges).not.toHaveBeenCalled();
  });

  it("replays an idempotent push response", async () => {
    const db = createTestDb();
    const applyPushChanges = vi.fn(async () => ({
      serverTime: "2026-05-20T00:00:00.000Z",
      tables: [],
    }));
    const handler = createSyncPushHandler<
      { sessionId: string },
      { merchantId: string }
    >({
      applyPushChanges,
      encoding: "json",
      idempotency: { db },
      resolveScope: vi.fn(async ({ scopeId }) =>
        authorizedScope({ merchantId: scopeId })
      ),
      upsertOrder: ["categories", "products"],
    });

    const request = createJsonRequest({
      scopeId: "merchant-1",
      clientId: "client-1",
      idempotencyKey: "idem-1",
      tables: [],
    });

    const first = await handler(request.clone(), { sessionId: "session-1" });
    const second = await handler(request.clone(), { sessionId: "session-1" });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toEqual(await second.json());
    expect(applyPushChanges).toHaveBeenCalledTimes(1);
  });
});

describe("createSyncStatusHandler", () => {
  it("loads authorized status data", async () => {
    const handler = createSyncStatusHandler<
      { sessionId: string },
      { merchantId: string }
    >({
      encoding: "json",
      loadSyncStatus: vi.fn(async (input) => ({
        changedTables: ["categories", "products"],
        cursor: input.cursor,
        hasChanges: true,
        serverTime: "2026-05-20T00:00:00.000Z",
      })),
      resolveScope: vi.fn(async ({ scopeId }) =>
        authorizedScope({ merchantId: scopeId })
      ),
    });

    const response = await handler(
      createJsonRequest({
        scopeId: "merchant-1",
        cursor: "sync:123:categories:row-1",
      }),
      { sessionId: "session-1" }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      changedTables: ["categories", "products"],
      cursor: "sync:123:categories:row-1",
      hasChanges: true,
      serverTime: "2026-05-20T00:00:00.000Z",
    });
  });

  it("returns the authorization response without calling loadSyncStatus", async () => {
    const loadSyncStatus = vi.fn();
    const handler = createSyncStatusHandler<
      { sessionId: string },
      { merchantId: string }
    >({
      encoding: "json",
      loadSyncStatus,
      resolveScope: vi.fn(async () =>
        unauthorizedScope({ error: "forbidden" }, 403)
      ),
    });

    const response = await handler(
      createJsonRequest({
        scopeId: "merchant-1",
        cursor: "sync:123:categories:row-1",
      }),
      { sessionId: "session-1" }
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
    expect(loadSyncStatus).not.toHaveBeenCalled();
  });

  it("supports protobuf status requests and responses", async () => {
    const schema = createProtobufSchema();
    const handler = createSyncStatusHandler<
      { sessionId: string },
      { merchantId: string }
    >({
      encoding: "protobuf",
      loadSyncStatus: vi.fn(async (input) => ({
        changedTables: ["categories"],
        cursor: input.cursor,
        hasChanges: true,
        serverTime: "2026-05-20T00:00:00.000Z",
      })),
      protobufSchema: schema,
      resolveScope: vi.fn(async ({ scopeId }) =>
        authorizedScope({ merchantId: scopeId })
      ),
    });

    const requestBytes = encodeProtobufBody({
      body: {
        scopeId: "merchant-1",
        cursor: "sync:123:categories:row-1",
      },
      kind: "status",
      message: "request",
      schema,
    });

    const response = await handler(createProtobufRequest(requestBytes), {
      sessionId: "session-1",
    });

    expect(response.headers.get("Content-Type")).toBe("application/x-protobuf");
    const decoded = decodeProtobufBody({
      bytes: new Uint8Array(await response.arrayBuffer()),
      kind: "status",
      message: "response",
      schema,
    });
    expect(decoded).toEqual({
      changedTables: ["categories"],
      cursor: "sync:123:categories:row-1",
      hasChanges: true,
      serverTime: "2026-05-20T00:00:00.000Z",
    });
  });
});

describe("createSyncPullHandler", () => {
  it("loads authorized pull data with configured limit", async () => {
    const handler = createSyncPullHandler<
      { sessionId: string },
      { merchantId: string }
    >({
      encoding: "json",
      loadPullChanges: vi.fn(async (input) => ({
        cursor: input.cursor,
        hasMore: false,
        serverTime: "2026-05-20T00:00:00.000Z",
        tables: input.tables.map((table: string) => ({
          acceptedCreatedIds: [],
          acceptedDeletedIds: [],
          acceptedUpdatedIds: [],
          rejected: [],
          table,
        })),
      })),
      limit: 25,
      resolveScope: vi.fn(async ({ scopeId }) =>
        authorizedScope({ merchantId: scopeId })
      ),
    });

    const response = await handler(
      createJsonRequest({
        scopeId: "merchant-1",
        cursor: "sync:123:categories:row-1",
        tables: ["categories", "products"],
      }),
      { sessionId: "session-1" }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      cursor: "sync:123:categories:row-1",
      hasMore: false,
      serverTime: "2026-05-20T00:00:00.000Z",
      tables: [
        {
          acceptedCreatedIds: [],
          acceptedDeletedIds: [],
          acceptedUpdatedIds: [],
          rejected: [],
          table: "categories",
        },
        {
          acceptedCreatedIds: [],
          acceptedDeletedIds: [],
          acceptedUpdatedIds: [],
          rejected: [],
          table: "products",
        },
      ],
    });
  });

  it("returns the authorization response without calling loadPullChanges", async () => {
    const loadPullChanges = vi.fn();
    const handler = createSyncPullHandler<
      { sessionId: string },
      { merchantId: string }
    >({
      encoding: "json",
      loadPullChanges,
      limit: 25,
      resolveScope: vi.fn(async () =>
        unauthorizedScope({ error: "forbidden" }, 403)
      ),
    });

    const response = await handler(
      createJsonRequest({
        scopeId: "merchant-1",
        cursor: "sync:123:categories:row-1",
        tables: ["categories"],
      }),
      { sessionId: "session-1" }
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
    expect(loadPullChanges).not.toHaveBeenCalled();
  });
});
