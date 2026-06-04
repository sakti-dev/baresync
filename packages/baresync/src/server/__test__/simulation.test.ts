import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { describe, expect, it } from "vitest";
import { syncBatchRequests } from "../../schema/server-schema";
import {
  ConflictRequestError,
  cleanupSyncBatchRequests,
  createIdempotencyGuard,
} from "../idempotency";
import {
  countPushRows,
  decodeSyncRequest,
  encodeSyncResponse,
  orderPushChanges,
  parseSyncCursor,
  SyncPayloadTooLargeError,
  validatePushEnvelope,
} from "../service";
import {
  baselinePull,
  idempotentReplay,
  payloadTooLarge,
  pushBody,
  serverSoftDelete,
} from "./fixtures";

function createTestDb() {
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
  return drizzle(sqlite);
}

describe("simulation: baseline pull fixture ordering", () => {
  it("orders pull fixture tables in FK order", () => {
    const changes = baselinePull.tables.map((t) => ({
      table: t.table,
      changedRows: t.changedRows,
      deletedIds: t.deletedIds as string[],
    }));
    const ordered = orderPushChanges({
      changes,
      order: ["categories", "products"],
    });
    const tables = ordered.map((c) => c.table);
    expect(tables).toEqual(["categories", "products"]);
  });
});

describe("simulation: push with reversed order is reordered", () => {
  it("reorders reversed push into FK order", () => {
    const changes = [
      {
        table: "products",
        changedRows: pushBody.tables.find((t) => t.table === "products")!
          .changedRows,
        deletedIds: [] as string[],
      },
      {
        table: "categories",
        changedRows: pushBody.tables.find((t) => t.table === "categories")!
          .changedRows,
        deletedIds: [] as string[],
      },
    ];
    const ordered = orderPushChanges({
      changes,
      order: ["categories", "products"],
    });
    const tables = ordered.map((c) => c.table);
    expect(tables).toEqual(["categories", "products"]);
  });
});

describe("simulation: idempotent push replay", () => {
  it("replays cached response on identical triple", async () => {
    const db = createTestDb();
    const guard = createIdempotencyGuard({ db });
    const { clientId, idempotencyKey, requestHash } =
      idempotentReplay.firstRequest;

    let callCount = 0;
    const callback = () => {
      callCount++;
      return Promise.resolve({ serverTime: "2026-05-19T12:00:00.000Z" });
    };

    const first = await guard.run(
      { clientId, idempotencyKey, requestHash },
      callback
    );
    const second = await guard.run(
      { clientId, idempotencyKey, requestHash },
      callback
    );

    expect(first.wasReplay).toBe(false);
    expect(second.wasReplay).toBe(true);
    expect(callCount).toBe(1);
    expect(first.result).toEqual(second.result);
  });
});

describe("simulation: idempotency key conflict", () => {
  it("throws ConflictRequestError for same key with different requestHash", async () => {
    const db = createTestDb();
    const guard = createIdempotencyGuard({ db });
    const { clientId, idempotencyKey } = idempotentReplay.firstRequest;

    await guard.run(
      { clientId, idempotencyKey, requestHash: "hash-a" },
      async () => ({ ok: true })
    );

    await expect(
      guard.run(
        { clientId, idempotencyKey, requestHash: "hash-b" },
        async () => ({ ok: true })
      )
    ).rejects.toThrow(ConflictRequestError);
  });
});

describe("simulation: oversized push body", () => {
  it("throws SyncPayloadTooLargeError when exceeding maxBytes", () => {
    const body = payloadTooLarge as unknown as Record<string, unknown>;
    expect(() =>
      validatePushEnvelope({ body }, { maxBytes: 262_144, maxRows: 10_000 })
    ).toThrow(SyncPayloadTooLargeError);
  });
});

describe("simulation: row count overflow", () => {
  it("throws SyncPayloadTooLargeError when exceeding maxRows", () => {
    const body = {
      tables: [
        { changedRows: [1, 2, 3, 4, 5], deletedIds: ["a"] },
        { changedRows: [6], deletedIds: ["b", "c"] },
      ],
    };
    expect(() =>
      validatePushEnvelope(
        { body },
        { maxBytes: Number.MAX_SAFE_INTEGER, maxRows: 5 }
      )
    ).toThrow(SyncPayloadTooLargeError);
  });
});

describe("simulation: invalid cursor", () => {
  it("throws on malformed cursor string", () => {
    expect(() => parseSyncCursor("invalid")).toThrow(
      "Invalid sync cursor format"
    );
  });
});

describe("simulation: server soft-delete fixture", () => {
  it("has products in deletedIds with empty changedRows", () => {
    const products = serverSoftDelete.tables.find(
      (t) => t.table === "products"
    );
    expect(products).toBeDefined();
    expect(products!.deletedIds).toEqual(["prod-1"]);
    expect(products!.changedRows).toEqual([]);
  });
});

describe("simulation: cleanup deletes old completed rows", () => {
  it("deletes old completed and preserves newer", async () => {
    const db = createTestDb();
    const oldTime = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const recentTime = Date.now() - 1000;

    await db.insert(syncBatchRequests).values({
      clientId: "c1",
      idempotencyKey: "old1",
      requestHash: "h1",
      status: "completed",
      responseBody: '{"ok":true}',
      createdAt: oldTime,
      completedAt: oldTime + 1000,
    });
    await db.insert(syncBatchRequests).values({
      clientId: "c2",
      idempotencyKey: "recent1",
      requestHash: "h2",
      status: "completed",
      responseBody: '{"ok":true}',
      createdAt: recentTime,
      completedAt: Date.now(),
    });

    const result = await cleanupSyncBatchRequests({
      db,
      olderThanMs: 7 * 24 * 60 * 60 * 1000,
    });

    expect(result.deletedCount).toBe(1);
    const remaining = await db.select().from(syncBatchRequests);
    expect(remaining.length).toBe(1);
    expect(remaining[0].idempotencyKey).toBe("recent1");
  });
});

describe("simulation: cleanup dry-run", () => {
  it("reports counts without deleting", async () => {
    const db = createTestDb();
    const oldTime = Date.now() - 8 * 24 * 60 * 60 * 1000;

    await db.insert(syncBatchRequests).values({
      clientId: "c1",
      idempotencyKey: "old1",
      requestHash: "h1",
      status: "completed",
      responseBody: '{"ok":true}',
      createdAt: oldTime,
      completedAt: oldTime + 1000,
    });

    const result = await cleanupSyncBatchRequests({
      db,
      olderThanMs: 7 * 24 * 60 * 60 * 1000,
      dryRun: true,
    });

    expect(result.deletedCount).toBe(1);
    const rows = await db.select().from(syncBatchRequests);
    expect(rows.length).toBe(1);
  });
});

describe("simulation: cleanup preserves pending rows", () => {
  it("does not delete pending rows by default", async () => {
    const db = createTestDb();
    const oldTime = Date.now() - 8 * 24 * 60 * 60 * 1000;

    await db.insert(syncBatchRequests).values({
      clientId: "c1",
      idempotencyKey: "pending1",
      requestHash: "h1",
      status: "pending",
      responseBody: '{"pending":true}',
      createdAt: oldTime,
    });

    const result = await cleanupSyncBatchRequests({
      db,
      olderThanMs: 7 * 24 * 60 * 60 * 1000,
    });

    expect(result.deletedCount).toBe(0);
    const rows = await db.select().from(syncBatchRequests);
    expect(rows.length).toBe(1);
  });
});

describe("simulation: full server primitive pipeline", () => {
  it("processes valid push through decode → validate → order → idempotency → encode", async () => {
    const db = createTestDb();
    const guard = createIdempotencyGuard({ db });

    const pushBodyObj = {
      scopeId: "merchant-1",
      clientId: "client-pipeline-1",
      idempotencyKey: "idem-pipeline-001",
      tables: [
        {
          table: "categories",
          changedRows: [
            {
              id: "cat-1",
              merchantId: "merchant-1",
              name: "Drinks",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          deletedIds: [],
        },
        {
          table: "products",
          changedRows: [
            {
              id: "prod-1",
              merchantId: "merchant-1",
              categoryId: "cat-1",
              name: "Kopi Susu",
              priceMinorUnits: 15_000,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          deletedIds: [],
        },
      ],
    };

    const pushRequest = new Request("http://localhost/sync", {
      body: JSON.stringify(pushBodyObj),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    const decoded = await decodeSyncRequest({
      kind: "push",
      request: pushRequest,
    });

    validatePushEnvelope(decoded, {
      maxBytes: 1024 * 1024,
      maxRows: 1000,
    });

    const ordered = orderPushChanges({
      changes: pushBodyObj.tables as Array<{
        table: string;
        changedRows: unknown[];
        deletedIds: string[];
      }>,
      order: ["categories", "products"],
    });
    expect(ordered[0].table).toBe("categories");

    const guardResult = await guard.run(
      {
        clientId: pushBodyObj.clientId,
        idempotencyKey: pushBodyObj.idempotencyKey,
        requestHash: decoded.requestHash,
      },
      async () => ({ serverTime: "2026-05-19T12:00:00.000Z" })
    );

    const response = encodeSyncResponse({
      body: guardResult.result,
      kind: "push",
    });

    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect((responseBody as Record<string, unknown>).serverTime).toBe(
      "2026-05-19T12:00:00.000Z"
    );

    const dbRows = await db.select().from(syncBatchRequests);
    expect(dbRows.length).toBe(1);
    expect(dbRows[0].status).toBe("completed");
  });
});

describe("simulation: mixed changedRows and deletedIds on same table", () => {
  it("orderPushChanges preserves both changedRows and deletedIds", () => {
    const changes = [
      {
        table: "products",
        changedRows: [{ id: "prod-2", name: "Latte" }],
        deletedIds: ["prod-1"],
      },
    ];
    const ordered = orderPushChanges({
      changes,
      order: ["categories", "products"],
    });
    expect(ordered.length).toBe(1);
    expect(ordered[0].table).toBe("products");
    expect(ordered[0].changedRows.length).toBe(1);
    expect(ordered[0].deletedIds).toEqual(["prod-1"]);
  });
});

describe("simulation: delete-only push validation", () => {
  it("validatePushEnvelope passes for delete-only body", () => {
    const body = {
      scopeId: "merchant-1",
      clientId: "client-1",
      idempotencyKey: "key-del-1",
      tables: [
        {
          table: "categories",
          changedRows: [],
          deletedIds: ["cat-1", "cat-2"],
        },
      ],
    };
    expect(() =>
      validatePushEnvelope(
        { body: body as unknown as Record<string, unknown> },
        { maxBytes: 1024 * 1024, maxRows: 100 }
      )
    ).not.toThrow();
  });

  it("countPushRows counts deletedIds for delete-only body", () => {
    const body = {
      tables: [
        {
          changedRows: [] as unknown[],
          deletedIds: ["cat-1", "cat-2", "cat-3"],
        },
      ],
    };
    expect(countPushRows(body as unknown as Record<string, unknown>)).toBe(3);
  });
});

describe("simulation: re-sync pipeline after ConflictRequestError", () => {
  it("new idempotency key succeeds after conflict", async () => {
    const db = createTestDb();
    const guard = createIdempotencyGuard({ db });

    await guard.run(
      {
        clientId: "client-1",
        idempotencyKey: "key-1",
        requestHash: "hash-a",
      },
      async () => ({ serverTime: "2026-05-19T12:00:00.000Z" })
    );

    await expect(
      guard.run(
        {
          clientId: "client-1",
          idempotencyKey: "key-1",
          requestHash: "hash-b",
        },
        async () => ({ serverTime: "2026-05-19T12:00:01.000Z" })
      )
    ).rejects.toThrow(ConflictRequestError);

    const secondResult = await guard.run(
      {
        clientId: "client-1",
        idempotencyKey: "key-2",
        requestHash: "hash-c",
      },
      async () => ({ serverTime: "2026-05-19T12:00:02.000Z" })
    );

    expect(secondResult.wasReplay).toBe(false);
    expect((secondResult.result as Record<string, unknown>).serverTime).toBe(
      "2026-05-19T12:00:02.000Z"
    );

    const dbRows = await db.select().from(syncBatchRequests);
    expect(dbRows.length).toBe(2);
    expect(dbRows.map((r) => r.idempotencyKey).sort()).toEqual([
      "key-1",
      "key-2",
    ]);
  });
});
