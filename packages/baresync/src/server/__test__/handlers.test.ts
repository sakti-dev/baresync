import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { describe, expect, it, vi } from "vitest";
import {
  createSyncPullHandler,
  createSyncPushHandler,
  createSyncStatusHandler,
} from "../handlers";

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

function authorizedScope<TScope>(scope: TScope) {
  return { ok: true as const, scope };
}

function unauthorizedScope(body: unknown, status: number) {
  return { body, ok: false as const, status };
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
