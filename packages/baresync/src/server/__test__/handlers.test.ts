import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { describe, expect, it, vi } from "vitest";
import {
  createSyncServer,
  type SyncLoadPullChangesInput,
  type SyncLoadStatusInput,
  type SyncPushChangesInput,
  type SyncResolveScopeInput,
} from "../index";

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

function unauthorizedScope(body: { error: string }, status: number) {
  return { body, ok: false as const, status };
}

function createGroupedServer(options?: {
  resolveScope?: (
    input: SyncResolveScopeInput<{ sessionId: string }>
  ) => Promise<
    | { ok: true; scope: { merchantId: string } }
    | { body: { error: string }; ok: false; status: number }
  >;
}) {
  const db = createTestDb();
  const resolveScope =
    options?.resolveScope ??
    vi.fn(async ({ scopeId }: SyncResolveScopeInput<{ sessionId: string }>) =>
      authorizedScope({ merchantId: scopeId })
    );
  const applyPushChanges = vi.fn(
    async (
      input: SyncPushChangesInput<{ sessionId: string }, { merchantId: string }>
    ) => ({
      acceptedTables: input.changes.map((change) => change.table),
      scopeId: input.scopeId,
      serverTime: "2026-06-08T00:00:00.000Z",
    })
  );
  const loadPullChanges = vi.fn(
    async (
      input: SyncLoadPullChangesInput<
        { sessionId: string },
        { merchantId: string }
      >
    ) => ({
      cursor: input.cursor,
      hasMore: false,
      serverTime: "2026-06-08T00:00:00.000Z",
      tables: input.tables.map((table) => ({
        changedRows: [],
        deletedIds: [],
        table,
      })),
    })
  );
  const loadSyncStatus = vi.fn(
    async (
      input: SyncLoadStatusInput<{ sessionId: string }, { merchantId: string }>
    ) => ({
      changedTables: ["categories"],
      cursor: input.cursor,
      hasChanges: true,
      serverTime: "2026-06-08T00:00:00.000Z",
    })
  );

  const syncServer = createSyncServer<
    { sessionId: string },
    { merchantId: string }
  >({
    db,
    resolveScope,
    push: {
      applyPushChanges,
      upsertOrder: ["categories", "products"],
    },
    pull: {
      limit: 25,
      loadPullChanges,
    },
    status: {
      loadSyncStatus,
    },
  });

  return {
    applyPushChanges,
    db,
    loadPullChanges,
    loadSyncStatus,
    resolveScope,
    syncServer,
  };
}

describe("server exports", () => {
  it("exports createSyncServer and omits standalone route factories", async () => {
    const server = await import("../index");

    expect(server.createSyncServer).toBeTypeOf("function");
    expect("createSyncPushHandler" in server).toBe(false);
    expect("createSyncPullHandler" in server).toBe(false);
    expect("createSyncStatusHandler" in server).toBe(false);
  });
});

describe("createSyncServer", () => {
  it("orders grouped push changes and returns the push body", async () => {
    const { applyPushChanges, syncServer } = createGroupedServer();

    const response = await syncServer.push(
      createJsonRequest({
        scopeId: "merchant-1",
        clientId: "client-1",
        idempotencyKey: "idem-1",
        tables: [
          { table: "products", changedRows: [{ id: "p1" }], deletedIds: [] },
          {
            table: "categories",
            changedRows: [{ id: "c1" }],
            deletedIds: [],
          },
        ],
      }),
      { sessionId: "session-1" }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      acceptedTables: ["categories", "products"],
      scopeId: "merchant-1",
      serverTime: "2026-06-08T00:00:00.000Z",
    });
    expect(applyPushChanges).toHaveBeenCalledTimes(1);
  });

  it("replays grouped idempotent push responses using the parent db", async () => {
    const { applyPushChanges, syncServer } = createGroupedServer();

    const request = createJsonRequest({
      scopeId: "merchant-1",
      clientId: "client-1",
      idempotencyKey: "idem-grouped",
      tables: [],
    });

    const first = await syncServer.push(request.clone(), {
      sessionId: "session-1",
    });
    const second = await syncServer.push(request.clone(), {
      sessionId: "session-1",
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toEqual(await second.json());
    expect(applyPushChanges).toHaveBeenCalledTimes(1);
  });

  it("passes grouped pull limit to loadPullChanges", async () => {
    const { loadPullChanges, syncServer } = createGroupedServer();

    const response = await syncServer.pull(
      createJsonRequest({
        scopeId: "merchant-1",
        cursor: "sync:123:categories:row-1",
        tables: ["categories"],
      }),
      { sessionId: "session-1" }
    );

    expect(response.status).toBe(200);
    expect(loadPullChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 25,
        scopeId: "merchant-1",
      })
    );
  });

  it("uses grouped resolveScope for status", async () => {
    const { loadSyncStatus, resolveScope, syncServer } = createGroupedServer();

    const response = await syncServer.status(
      createJsonRequest({
        scopeId: "merchant-1",
        cursor: "sync:123:categories:row-1",
      }),
      { sessionId: "session-1" }
    );

    expect(response.status).toBe(200);
    expect(resolveScope).toHaveBeenCalledWith(
      expect.objectContaining({ scopeId: "merchant-1" })
    );
    expect(loadSyncStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { merchantId: "merchant-1" },
      })
    );
  });

  it("stops on denied scope without calling the operation callback", async () => {
    const { applyPushChanges, syncServer } = createGroupedServer({
      resolveScope: vi.fn(
        async (_input: SyncResolveScopeInput<{ sessionId: string }>) =>
          unauthorizedScope({ error: "forbidden" }, 403)
      ),
    });

    const response = await syncServer.push(
      createJsonRequest({
        scopeId: "merchant-1",
        clientId: "client-1",
        idempotencyKey: "idem-denied",
        tables: [],
      }),
      { sessionId: "session-1" }
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
    expect(applyPushChanges).not.toHaveBeenCalled();
  });
});
