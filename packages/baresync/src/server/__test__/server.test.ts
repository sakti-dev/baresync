import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { describe, expect, it } from "vitest";
import { syncBatchRequests } from "../../schema/server-schema";
import {
  ConflictRequestError,
  cleanupSyncBatchRequests,
  createIdempotencyGuard,
} from "../idempotency";
import {
  computeSyncRequestHash,
  decodeSyncRequest,
  encodeSyncResponse,
} from "../service";

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

describe("computeSyncRequestHash", () => {
  it("returns deterministic hash for same body", async () => {
    const body = { scopeId: "s1", tables: [] };
    const a = await computeSyncRequestHash(body);
    const b = await computeSyncRequestHash(body);
    expect(a).toBe(b);
  });

  it("returns different hash for different bodies", async () => {
    const a = await computeSyncRequestHash({ scopeId: "s1" });
    const b = await computeSyncRequestHash({ scopeId: "s2" });
    expect(a).not.toBe(b);
  });
});

describe("decodeSyncRequest", () => {
  it("computes requestHash for push request", async () => {
    const body = {
      scopeId: "s1",
      clientId: "c1",
      idempotencyKey: "key1",
      tables: [],
    };
    const result = await decodeSyncRequest({
      encoding: "json",
      kind: "push",
      request: createJsonRequest(body),
    });
    expect(result.requestHash).toBeTruthy();
    expect(typeof result.requestHash).toBe("string");
    expect(result.requestHash.length).toBe(64);
  });

  it("decodes status request and hashes the raw body bytes", async () => {
    const body = {
      scopeId: "s1",
      cursor: "sync:123:categories:row-1",
    };
    const rawBody = JSON.stringify(body);
    const request = createJsonRequest(body);
    const result = await decodeSyncRequest({
      encoding: "json",
      kind: "status",
      request,
    });

    expect(result.body).toEqual(body);
    expect(result.requestHash).toBe(await computeSyncRequestHash(rawBody));
  });

  it("rejects status requests without scopeId", async () => {
    await expect(
      decodeSyncRequest({
        encoding: "json",
        kind: "status",
        request: createJsonRequest({
          cursor: "sync:123:categories:row-1",
        }),
      })
    ).rejects.toThrow('Missing required status field: "scopeId"');
  });
});

describe("encodeSyncResponse", () => {
  it("encodes JSON status response bodies", async () => {
    const body = {
      changedTables: ["categories", "products"],
      hasChanges: true,
      cursor: "sync:123:categories:row-1",
      serverTime: "2026-05-19T12:00:00.000Z",
    };
    const response = encodeSyncResponse({
      body,
      encoding: "json",
      kind: "status",
    });

    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(await response.json()).toEqual(body);
  });
});

describe("createIdempotencyGuard", () => {
  it("processes first-time push normally", async () => {
    const db = createTestDb();
    const guard = createIdempotencyGuard({ db });

    const result = await guard.run(
      { clientId: "c1", idempotencyKey: "key1", requestHash: "hash1" },
      async () => ({ serverTime: 123 })
    );

    expect(result.result).toEqual({ serverTime: 123 });
    expect(result.wasReplay).toBe(false);
  });

  it("replays cached response for duplicate push", async () => {
    const db = createTestDb();
    const guard = createIdempotencyGuard({ db });

    let callCount = 0;
    const callback = () => {
      callCount++;
      return Promise.resolve({ serverTime: 456 });
    };

    const first = await guard.run(
      { clientId: "c1", idempotencyKey: "key1", requestHash: "hash1" },
      callback
    );

    const second = await guard.run(
      { clientId: "c1", idempotencyKey: "key1", requestHash: "hash1" },
      callback
    );

    expect(first.result).toEqual({ serverTime: 456 });
    expect(first.wasReplay).toBe(false);
    expect(second.result).toEqual({ serverTime: 456 });
    expect(second.wasReplay).toBe(true);
    expect(callCount).toBe(1);
  });

  it("throws 409 for same key with different body", async () => {
    const db = createTestDb();
    const guard = createIdempotencyGuard({ db });

    await guard.run(
      { clientId: "c1", idempotencyKey: "key1", requestHash: "hash1" },
      async () => ({ ok: true })
    );

    await expect(
      guard.run(
        { clientId: "c1", idempotencyKey: "key1", requestHash: "hash2" },
        async () => ({ ok: true })
      )
    ).rejects.toThrow(ConflictRequestError);

    try {
      await guard.run(
        { clientId: "c1", idempotencyKey: "key1", requestHash: "hash2" },
        async () => ({ ok: true })
      );
    } catch (e) {
      expect((e as ConflictRequestError).status).toBe(409);
    }
  });

  it("throws 409 for concurrent push with same key", async () => {
    const db = createTestDb();

    await db.insert(syncBatchRequests).values({
      clientId: "c1",
      idempotencyKey: "key1",
      requestHash: "hash1",
      status: "pending",
      responseBody: '{"pending":true}',
      createdAt: Date.now(),
    });

    const guard = createIdempotencyGuard({ db });

    await expect(
      guard.run(
        { clientId: "c1", idempotencyKey: "key1", requestHash: "hash1" },
        async () => ({ ok: true })
      )
    ).rejects.toThrow("sync push is already in progress");
  });
});

describe("cleanupSyncBatchRequests", () => {
  it("deletes old completed rows", async () => {
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
    });

    expect(result.deletedCount).toBe(1);
  });

  it("preserves recent rows", async () => {
    const db = createTestDb();

    await db.insert(syncBatchRequests).values({
      clientId: "c1",
      idempotencyKey: "recent1",
      requestHash: "h1",
      status: "completed",
      responseBody: '{"ok":true}',
      createdAt: Date.now() - 1000,
      completedAt: Date.now(),
    });

    const result = await cleanupSyncBatchRequests({
      db,
      olderThanMs: 7 * 24 * 60 * 60 * 1000,
    });

    expect(result.deletedCount).toBe(0);
  });

  it("preserves pending rows by default", async () => {
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
  });

  it("deletes stale pending rows with explicit threshold", async () => {
    const db = createTestDb();
    const staleTime = Date.now() - 2 * 60 * 60 * 1000;

    await db.insert(syncBatchRequests).values({
      clientId: "c1",
      idempotencyKey: "stale1",
      requestHash: "h1",
      status: "pending",
      responseBody: '{"pending":true}',
      createdAt: staleTime,
    });

    const result = await cleanupSyncBatchRequests({
      db,
      olderThanMs: 7 * 24 * 60 * 60 * 1000,
      stalePendingOlderThanMs: 60 * 60 * 1000,
    });

    expect(result.deletedCount).toBe(1);
  });

  it("respects limit for bounded deletes", async () => {
    const db = createTestDb();
    const oldTime = Date.now() - 8 * 24 * 60 * 60 * 1000;

    for (let i = 0; i < 5; i++) {
      await db.insert(syncBatchRequests).values({
        clientId: `c${i}`,
        idempotencyKey: `key${i}`,
        requestHash: `h${i}`,
        status: "completed",
        responseBody: '{"ok":true}',
        createdAt: oldTime + i * 1000,
        completedAt: oldTime + i * 1000 + 500,
      });
    }

    const result = await cleanupSyncBatchRequests({
      db,
      olderThanMs: 7 * 24 * 60 * 60 * 1000,
      limit: 2,
    });

    expect(result.deletedCount).toBe(2);
    expect(result.oldestDeleted).toBeDefined();
    expect(result.newestDeleted).toBeDefined();
  });

  it("dry-run returns counts without deleting", async () => {
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
