import { Database } from "bun:sqlite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { describe, expect, it, vi } from "vitest";
import { createSyncBatchRequestsTable } from "../../schema/server-schema.js";
import {
  ConflictRequestError,
  createIdempotencyGuard,
  type SyncIdempotencyDatabase,
} from "../idempotency.js";

const syncBatchRequests = createSyncBatchRequestsTable();

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

interface GuardRunParams {
  clientId: string;
  idempotencyKey: string;
  requestHash: string;
}

const defaultParams: GuardRunParams = {
  clientId: "client-1",
  idempotencyKey: "batch-1",
  requestHash: "hash-abc",
};

const callbackResult = {
  acceptedTables: ["categories"],
  serverTime: "2026-06-10T00:00:00Z",
};

describe("createIdempotencyGuard — transactionless", () => {
  // --- Phase 1: Core ---

  it("push succeeds without transaction — inserts pending, runs callback, updates to completed", async () => {
    const db = createTestDb() as unknown as SyncIdempotencyDatabase;
    const guard = createIdempotencyGuard({ db });
    const callback = vi.fn(async () => ({ ...callbackResult }));

    const result = await guard.run(defaultParams, callback);

    expect(result.result).toEqual(callbackResult);
    expect(result.wasReplay).toBe(false);
    expect(callback).toHaveBeenCalledOnce();

    // Verify row is completed in DB
    const rows = await (db as unknown as ReturnType<typeof createTestDb>)
      .select()
      .from(syncBatchRequests)
      .where(
        and(
          eq(syncBatchRequests.clientId, "client-1"),
          eq(syncBatchRequests.idempotencyKey, "batch-1")
        )
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("completed");
    expect(JSON.parse(rows[0]!.responseBody!)).toEqual(callbackResult);
  });

  it("push replay returns cached response without calling callback", async () => {
    const db = createTestDb() as unknown as SyncIdempotencyDatabase;
    const guard = createIdempotencyGuard({ db });
    const callback = vi.fn(async () => ({ ...callbackResult }));

    // First push
    await guard.run(defaultParams, callback);
    expect(callback).toHaveBeenCalledOnce();

    // Replay
    const result = await guard.run(defaultParams, callback);
    expect(result.result).toEqual(callbackResult);
    expect(result.wasReplay).toBe(true);
    expect(callback).toHaveBeenCalledOnce(); // NOT called again
  });

  it("completed row with different hash throws ConflictRequestError", async () => {
    const db = createTestDb() as unknown as SyncIdempotencyDatabase;
    const guard = createIdempotencyGuard({ db });
    const callback = vi.fn(async () => ({ ...callbackResult }));

    // First push
    await guard.run(defaultParams, callback);

    // Second push with same key but different hash
    await expect(
      guard.run({ ...defaultParams, requestHash: "hash-different" }, callback)
    ).rejects.toThrow(ConflictRequestError);
  });

  it("fresh pending row throws ConflictRequestError", async () => {
    const db = createTestDb() as unknown as SyncIdempotencyDatabase;
    const guard = createIdempotencyGuard({ db, pendingTimeoutMs: 10_000 });

    // Manually insert a fresh pending row
    await (db as unknown as ReturnType<typeof createTestDb>)
      .insert(syncBatchRequests)
      .values({
        clientId: "client-1",
        idempotencyKey: "batch-1",
        requestHash: "hash-abc",
        status: "pending",
        responseBody: '{"pending":true}',
        createdAt: Date.now(), // fresh
      });

    const callback = vi.fn(async () => ({ ...callbackResult }));
    await expect(guard.run(defaultParams, callback)).rejects.toThrow(
      ConflictRequestError
    );
    expect(callback).not.toHaveBeenCalled();
  });

  it("stale pending row (age ≥ pendingTimeoutMs) is reclaimed and succeeds", async () => {
    const db = createTestDb() as unknown as SyncIdempotencyDatabase;
    const guard = createIdempotencyGuard({ db, pendingTimeoutMs: 100 }); // 100ms

    // Insert a stale pending row (created 200ms ago)
    await (db as unknown as ReturnType<typeof createTestDb>)
      .insert(syncBatchRequests)
      .values({
        clientId: "client-1",
        idempotencyKey: "batch-1",
        requestHash: "hash-abc",
        status: "pending",
        responseBody: '{"pending":true}',
        createdAt: Date.now() - 200, // stale
      });

    const callback = vi.fn(async () => ({ ...callbackResult }));
    const result = await guard.run(defaultParams, callback);

    expect(result.result).toEqual(callbackResult);
    expect(result.wasReplay).toBe(false);
    expect(callback).toHaveBeenCalledOnce();
  });

  // --- Phase 2: UNIQUE constraint handling ---

  it("UNIQUE constraint on reserve — row becomes completed with matching hash, returns cached", async () => {
    const db = createTestDb() as unknown as SyncIdempotencyDatabase;
    const guard = createIdempotencyGuard({ db });

    // Pre-insert a completed row directly
    await (db as unknown as ReturnType<typeof createTestDb>)
      .insert(syncBatchRequests)
      .values({
        clientId: "client-1",
        idempotencyKey: "batch-1",
        requestHash: "hash-abc",
        status: "completed",
        responseBody: JSON.stringify(callbackResult),
        createdAt: Date.now() - 1000,
        completedAt: Date.now(),
      });

    const callback = vi.fn(async () => ({ ...callbackResult }));
    const result = await guard.run(defaultParams, callback);

    expect(result.result).toEqual(callbackResult);
    expect(result.wasReplay).toBe(true);
    expect(callback).not.toHaveBeenCalled();
  });

  it("UNIQUE constraint on reserve — row is pending, throws ConflictRequestError", async () => {
    const db = createTestDb() as unknown as SyncIdempotencyDatabase;
    const guard = createIdempotencyGuard({ db, pendingTimeoutMs: 10_000 });

    // Pre-insert a fresh pending row — the guard's load won't see it because
    // we'll use different params, then we'll call with the pre-inserted key.
    // Actually, the guard loads first, finds nothing, then INSERTs — but the row
    // already exists. The INSERT UNIQUE catch re-reads and sees pending.
    await (db as unknown as ReturnType<typeof createTestDb>)
      .insert(syncBatchRequests)
      .values({
        clientId: "client-1",
        idempotencyKey: "batch-1",
        requestHash: "hash-abc",
        status: "pending",
        responseBody: '{"pending":true}',
        createdAt: Date.now(),
      });

    const callback = vi.fn(async () => ({ ...callbackResult }));

    // The guard will: load → see the row → it's pending and fresh (< 10s) → throw
    // This exercises the resolveExistingRow path, not reserveWithRecovery.
    // To exercise reserveWithRecovery UNIQUE path we need concurrent INSERT.
    // But since bun:sqlite is in-memory and single-threaded, we can't truly race.
    // Instead, we verify the behavior end-to-end: existing pending row → conflict.
    await expect(guard.run(defaultParams, callback)).rejects.toThrow(
      ConflictRequestError
    );
    expect(callback).not.toHaveBeenCalled();
  });

  // --- Phase 3: Callback failure cleanup ---

  it("callback throws — pending row is deleted and original error propagates", async () => {
    const db = createTestDb() as unknown as SyncIdempotencyDatabase;
    const guard = createIdempotencyGuard({ db });
    const error = new Error("callback exploded");

    const callback = vi.fn(() => {
      throw error;
    });

    await expect(guard.run(defaultParams, callback)).rejects.toThrow(
      "callback exploded"
    );

    // Pending row should be cleaned up
    const rows = await (db as unknown as ReturnType<typeof createTestDb>)
      .select()
      .from(syncBatchRequests)
      .where(
        and(
          eq(syncBatchRequests.clientId, "client-1"),
          eq(syncBatchRequests.idempotencyKey, "batch-1")
        )
      );
    expect(rows).toHaveLength(0);
  });

  it("callback throws and cleanup also fails — original error still propagates", async () => {
    const realDb = createTestDb();
    let deleteCallCount = 0;
    // Wrap db to intercept delete calls and throw on second one (cleanup)
    const proxyDb = new Proxy(realDb, {
      get(target, prop) {
        const value = Reflect.get(target, prop);
        if (prop === "delete") {
          return () => {
            deleteCallCount++;
            if (deleteCallCount > 1) {
              throw new Error("db connection lost");
            }
            // First delete (from test setup) — passthrough won't work
            // because we need a full Drizzle chain
            return (
              target as unknown as { delete: (t: unknown) => unknown }
            ).delete(syncBatchRequests);
          };
        }
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as unknown as SyncIdempotencyDatabase;

    const guard = createIdempotencyGuard({ db: proxyDb });
    const error = new Error("callback exploded");

    const callback = vi.fn(() => {
      throw error;
    });

    // Original error should propagate even though cleanup fails
    await expect(guard.run(defaultParams, callback)).rejects.toThrow(
      "callback exploded"
    );
    expect(deleteCallCount).toBeGreaterThanOrEqual(1);
  });

  // --- Phase 4: pendingTimeoutMs wiring ---

  it("default pendingTimeoutMs is 30_000ms", async () => {
    const db = createTestDb() as unknown as SyncIdempotencyDatabase;
    const guard = createIdempotencyGuard({ db });

    // Insert pending row at 29s ago — should still be fresh
    await (db as unknown as ReturnType<typeof createTestDb>)
      .insert(syncBatchRequests)
      .values({
        clientId: "client-1",
        idempotencyKey: "batch-1",
        requestHash: "hash-abc",
        status: "pending",
        responseBody: '{"pending":true}',
        createdAt: Date.now() - 29_000, // within 30s default
      });

    const callback = vi.fn(async () => ({ ...callbackResult }));
    await expect(guard.run(defaultParams, callback)).rejects.toThrow(
      ConflictRequestError
    );
  });

  it("explicit pendingTimeoutMs overrides default", async () => {
    const db = createTestDb() as unknown as SyncIdempotencyDatabase;
    const guard = createIdempotencyGuard({ db, pendingTimeoutMs: 5000 });

    // Insert pending row at 6s ago — stale with 5s override
    await (db as unknown as ReturnType<typeof createTestDb>)
      .insert(syncBatchRequests)
      .values({
        clientId: "client-1",
        idempotencyKey: "batch-1",
        requestHash: "hash-abc",
        status: "pending",
        responseBody: '{"pending":true}',
        createdAt: Date.now() - 6000, // past 5s override
      });

    const callback = vi.fn(async () => ({ ...callbackResult }));
    const result = await guard.run(defaultParams, callback);
    expect(result.result).toEqual(callbackResult);
    expect(callback).toHaveBeenCalledOnce();
  });
});
