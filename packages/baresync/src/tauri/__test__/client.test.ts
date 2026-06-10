import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { createSyncClient } from "../client.js";

const testItems = sqliteTable("items", {
  id: text("id").primaryKey(),
});

/**
 * Structural interface for the raw SQLite calls used in integration tests.
 * Avoids depending on bun:sqlite type declarations which tsc cannot resolve.
 */
interface TestSqlite {
  exec(sql: string): void;
  prepare(sql: string): {
    all(): Record<string, unknown>[];
    get(): Record<string, unknown> | undefined;
    run(): void;
  };
}

function createRecordingTx() {
  const inserted: Array<{ table: unknown; values: Record<string, unknown> }> =
    [];
  const tx = {
    insert(table: unknown) {
      return {
        values(values: Record<string, unknown>) {
          inserted.push({ table, values });
          const thenable = Promise.resolve({ rowsAffected: 1 });
          return Object.assign(thenable, {
            onConflictDoUpdate() {
              return Promise.resolve({ rowsAffected: 1 });
            },
          });
        },
      };
    },
  };

  return { inserted, tx };
}

/**
 * Creates an in-memory SQLite database with the sync_outbox schema.
 * Used for integration tests that need real SQL execution.
 *
 * The DDL below is a manual copy of the Drizzle schema in local-schema.ts.
 * If the sync_outbox schema changes, this DDL must be updated to match.
 */
function createTestDb() {
  const sqlite = new Database(":memory:") as unknown as TestSqlite;
  sqlite.exec(`
    CREATE TABLE sync_outbox (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      row_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT,
      scope_id TEXT NOT NULL,
      changed_at TEXT NOT NULL,
      synced_at TEXT
    )
  `);
  sqlite.exec(`
    CREATE UNIQUE INDEX sync_outbox_pending_row_unique
    ON sync_outbox (table_name, row_id)
    WHERE synced_at IS NULL
  `);
  return { db: drizzle(sqlite as any), sqlite };
}

describe("createSyncClient", () => {
  it("returns client with all methods", () => {
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: () => Promise.resolve({}),
    });
    expect(client).toHaveProperty("syncNow");
    expect(client).toHaveProperty("push");
    expect(client).toHaveProperty("pull");
    expect(client).toHaveProperty("fullResync");
    expect(client).toHaveProperty("getState");
    expect(client).toHaveProperty("startPolling");
    expect(client).toHaveProperty("stopPolling");
    expect(client).toHaveProperty("pausePolling");
    expect(client).toHaveProperty("resumePolling");
    expect(client).toHaveProperty("setHeaders");
    expect(client).toHaveProperty("getPollingStatus");
    expect(client).toHaveProperty("writeTransaction");
    expect(client).toHaveProperty("writeLocalChange");
    expect(client).toHaveProperty("enqueueChange");
    expect(typeof client.syncNow).toBe("function");
    expect(typeof client.push).toBe("function");
    expect(typeof client.pull).toBe("function");
    expect(typeof client.fullResync).toBe("function");
    expect(typeof client.getState).toBe("function");
    expect(typeof client.startPolling).toBe("function");
    expect(typeof client.stopPolling).toBe("function");
    expect(typeof client.pausePolling).toBe("function");
    expect(typeof client.resumePolling).toBe("function");
    expect(typeof client.setHeaders).toBe("function");
    expect(typeof client.getPollingStatus).toBe("function");
    expect(typeof client.writeTransaction).toBe("function");
    expect(typeof client.writeLocalChange).toBe("function");
    expect(typeof client.enqueueChange).toBe("function");
  });

  it("syncNow calls invoke with plugin command", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: (cmd, args) => {
        calls.push({ cmd, args });
        return Promise.resolve({});
      },
    });
    await client.syncNow();
    expect(calls).toEqual([
      { cmd: "plugin:baresync|sync_now", args: { scopeId: "outlet-1" } },
    ]);
  });

  it("push calls invoke with sync_push command", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: (cmd, args) => {
        calls.push({ cmd, args });
        return Promise.resolve({});
      },
    });
    await client.push();
    expect(calls).toEqual([
      { cmd: "plugin:baresync|sync_push", args: { scopeId: "outlet-1" } },
    ]);
  });

  it("pull calls invoke with sync_pull command", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: (cmd, args) => {
        calls.push({ cmd, args });
        return Promise.resolve({});
      },
    });
    await client.pull();
    expect(calls).toEqual([
      { cmd: "plugin:baresync|sync_pull", args: { scopeId: "outlet-1" } },
    ]);
  });

  it("fullResync calls invoke with sync_full_resync command", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: (cmd, args) => {
        calls.push({ cmd, args });
        return Promise.resolve({});
      },
    });
    await client.fullResync();
    expect(calls).toEqual([
      {
        cmd: "plugin:baresync|sync_full_resync",
        args: { scopeId: "outlet-1" },
      },
    ]);
  });

  it("getState calls invoke with get_sync_local_state command", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: (cmd, args) => {
        calls.push({ cmd, args });
        return Promise.resolve({});
      },
    });
    await client.getState();
    expect(calls).toEqual([
      {
        cmd: "plugin:baresync|get_sync_local_state",
        args: { scopeId: "outlet-1" },
      },
    ]);
  });

  it("supports custom command overrides", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const client = createSyncClient({
      commands: {
        fullResync: "sync_full_resync",
        getPollingStatus: "get_polling_status",
        getState: "get_sync_local_state",
        pausePolling: "pause_polling",
        pull: "sync_pull",
        push: "sync_push",
        resumePolling: "resume_polling",
        setHeaders: "my_set_headers",
        startPolling: "start_polling",
        stopPolling: "stop_polling",
        syncNow: "sync_now",
      },
      scopeId: "outlet-1",
      invoke: (cmd, args) => {
        calls.push({ cmd, args });
        return Promise.resolve({
          last_sync_at: null,
          paused: false,
          running: false,
        });
      },
    });

    await client.syncNow();
    await client.push();
    await client.pull();
    await client.fullResync();
    await client.getState();
    await client.startPolling();
    await client.stopPolling();
    await client.pausePolling();
    await client.resumePolling();
    await client.setHeaders({ Authorization: "Bearer test" });
    await client.getPollingStatus();

    expect(calls.map((call) => call.cmd)).toEqual([
      "sync_now",
      "sync_push",
      "sync_pull",
      "sync_full_resync",
      "get_sync_local_state",
      "start_polling",
      "stop_polling",
      "pause_polling",
      "resume_polling",
      "my_set_headers",
      "get_polling_status",
    ]);
  });

  it("uses custom invoke for testability", async () => {
    let called = false;
    const client = createSyncClient({
      scopeId: "test",
      invoke: () => {
        called = true;
        return Promise.resolve({ result: "mock" });
      },
    });
    await client.push();
    expect(called).toBe(true);
  });

  it("returns resolved mocked invoke results from all sync methods", async () => {
    const results: Record<string, unknown> = {
      "plugin:baresync|sync_now": { ok: true, method: "syncNow" },
      "plugin:baresync|sync_push": { ok: true, method: "push" },
      "plugin:baresync|sync_pull": { ok: true, method: "pull" },
      "plugin:baresync|sync_full_resync": { ok: true, method: "fullResync" },
      "plugin:baresync|get_sync_local_state": {
        local_dirty_count: 2,
        last_server_watermark: "sync:phase14",
        needs_baseline_sync: false,
      },
    };
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: (cmd) => Promise.resolve(results[cmd]),
    });

    await expect(client.syncNow()).resolves.toBe(
      results["plugin:baresync|sync_now"]
    );
    await expect(client.push()).resolves.toBe(
      results["plugin:baresync|sync_push"]
    );
    await expect(client.pull()).resolves.toBe(
      results["plugin:baresync|sync_pull"]
    );
    await expect(client.fullResync()).resolves.toBe(
      results["plugin:baresync|sync_full_resync"]
    );
    await expect(client.getState()).resolves.toBe(
      results["plugin:baresync|get_sync_local_state"]
    );
  });

  it("propagates rejected mocked invoke errors unchanged", async () => {
    const error = new Error("device invoke failed");
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: () => Promise.reject(error),
    });

    await expect(client.syncNow()).rejects.toBe(error);
    await expect(client.push()).rejects.toBe(error);
    await expect(client.pull()).rejects.toBe(error);
    await expect(client.fullResync()).rejects.toBe(error);
    await expect(client.getState()).rejects.toBe(error);
  });

  it("preserves structured command rejection values unchanged", async () => {
    const error = {
      code: "AUTH_EXPIRED",
      message: "session expired",
      retryable: false,
    };
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: () => Promise.reject(error),
    });

    await expect(client.syncNow()).rejects.toBe(error);
  });

  it("preserves command argument shape across all sync methods", async () => {
    const calls: Array<{ args?: Record<string, unknown>; cmd: string }> = [];
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: (cmd, args) => {
        calls.push({ cmd, args });
        return Promise.resolve({});
      },
    });

    await client.syncNow();
    await client.push();
    await client.pull();
    await client.fullResync();
    await client.getState();

    expect(calls).toEqual([
      { cmd: "plugin:baresync|sync_now", args: { scopeId: "outlet-1" } },
      { cmd: "plugin:baresync|sync_push", args: { scopeId: "outlet-1" } },
      { cmd: "plugin:baresync|sync_pull", args: { scopeId: "outlet-1" } },
      {
        cmd: "plugin:baresync|sync_full_resync",
        args: { scopeId: "outlet-1" },
      },
      {
        cmd: "plugin:baresync|get_sync_local_state",
        args: { scopeId: "outlet-1" },
      },
    ]);
  });

  it("throws descriptive error without Tauri runtime", async () => {
    const client = createSyncClient({
      scopeId: "test",
    });
    await expect(client.syncNow()).rejects.toThrow(
      "Tauri IPC is not available"
    );
  });

  it("startPolling calls invoke with start_polling command", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: (cmd, args) => {
        calls.push({ cmd, args });
        return Promise.resolve({});
      },
    });
    await client.startPolling();
    expect(calls).toEqual([
      { cmd: "plugin:baresync|start_polling", args: { scopeId: "outlet-1" } },
    ]);
  });

  it("stopPolling calls invoke without scopeId", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: (cmd, args) => {
        calls.push({ cmd, args });
        return Promise.resolve({});
      },
    });
    await client.stopPolling();
    expect(calls).toEqual([{ cmd: "plugin:baresync|stop_polling" }]);
  });

  it("pausePolling and resumePolling call correct commands", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: (cmd, args) => {
        calls.push({ cmd, args });
        return Promise.resolve({});
      },
    });
    await client.pausePolling();
    await client.resumePolling();
    expect(calls).toEqual([
      { cmd: "plugin:baresync|pause_polling" },
      { cmd: "plugin:baresync|resume_polling" },
    ]);
  });

  it("getPollingStatus calls invoke with get_polling_status", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: (cmd, args) => {
        calls.push({ cmd, args });
        return Promise.resolve({
          running: false,
          paused: false,
          last_sync_at: null,
        });
      },
    });
    const status = await client.getPollingStatus();
    expect(calls).toEqual([{ cmd: "plugin:baresync|get_polling_status" }]);
    expect(status).toEqual({
      running: false,
      paused: false,
      last_sync_at: null,
    });
  });

  it("polling methods propagate errors unchanged", async () => {
    const error = new Error("polling failed");
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: () => Promise.reject(error),
    });
    await expect(client.startPolling()).rejects.toBe(error);
    await expect(client.stopPolling()).rejects.toBe(error);
    await expect(client.pausePolling()).rejects.toBe(error);
    await expect(client.resumePolling()).rejects.toBe(error);
    await expect(client.getPollingStatus()).rejects.toBe(error);
  });

  it("writeTransaction resolves callback result and uses provided transaction", async () => {
    const tx = { kind: "tx" } as const;
    type TestTx = typeof tx;
    const db = {
      transaction<T>(callback: (tx: TestTx) => Promise<T>) {
        return callback(tx);
      },
    };
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: () => Promise.resolve({}),
    });

    const result = await client.writeTransaction(db, (callbackTx) => {
      expect(callbackTx).toBe(tx);
      return Promise.resolve("committed");
    });

    expect(result).toBe("committed");
  });

  it("writeTransaction propagates callback errors unchanged", async () => {
    const error = new Error("rollback me");
    const db = {
      transaction<T>(callback: (tx: unknown) => Promise<T>) {
        return callback({ kind: "tx" });
      },
    };
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: () => Promise.resolve({}),
    });

    await expect(
      client.writeTransaction(db, () => Promise.reject(error))
    ).rejects.toBe(error);
  });

  it("enqueueChange derives table name, configured scope, timestamp, and outbox id", async () => {
    const { inserted, tx } = createRecordingTx();
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: () => Promise.resolve({}),
    });

    await client.enqueueChange(tx, {
      operation: "insert",
      rowId: "item-1",
      table: testItems,
    });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.values).toMatchObject({
      operation: "insert",
      rowId: "item-1",
      scopeId: "outlet-1",
      tableName: "items",
    });
    expect(inserted[0]?.values.id).toEqual(expect.stringContaining("insert"));
    expect(inserted[0]?.values.id).toEqual(expect.stringContaining("items"));
    expect(inserted[0]?.values.id).toEqual(expect.stringContaining("item-1"));
    expect(
      new Date(inserted[0]?.values.changedAt as string).toString()
    ).not.toBe("Invalid Date");
    expect(inserted[0]?.values.syncedAt).toBeUndefined();
  });

  it("writeLocalChange runs the single-row write and then enqueues one outbox row", async () => {
    const events: string[] = [];
    const { inserted, tx } = createRecordingTx();
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: () => Promise.resolve({}),
    });

    await client.writeLocalChange(tx, {
      operation: "update",
      rowId: "item-1",
      table: testItems,
      write(writeTx) {
        expect(writeTx).toBe(tx);
        events.push("write");
      },
    });

    expect(events).toEqual(["write"]);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.values).toMatchObject({
      operation: "update",
      rowId: "item-1",
      scopeId: "outlet-1",
      tableName: "items",
    });
  });

  it("supports bulk flows by enqueueing once per affected row", async () => {
    const { inserted, tx } = createRecordingTx();
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: () => Promise.resolve({}),
    });

    for (const rowId of ["item-1", "item-2"]) {
      await client.enqueueChange(tx, {
        operation: "update",
        rowId,
        table: testItems,
      });
    }

    expect(inserted.map((entry) => entry.values.rowId)).toEqual([
      "item-1",
      "item-2",
    ]);
  });

  it("returns client with setHeaders method", () => {
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: () => Promise.resolve({}),
    });
    expect(client).toHaveProperty("setHeaders");
    expect(typeof client.setHeaders).toBe("function");
  });

  it("setHeaders calls invoke with default command and passes headers", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: (cmd, args) => {
        calls.push({ cmd, args });
        return Promise.resolve();
      },
    });
    await client.setHeaders({ Authorization: "Bearer abc123" });
    expect(calls).toEqual([
      {
        cmd: "plugin:baresync|set_headers",
        args: { headers: { Authorization: "Bearer abc123" } },
      },
    ]);
  });

  it("setHeaders uses custom command override", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const client = createSyncClient({
      commands: { setHeaders: "my_set_headers" },
      scopeId: "outlet-1",
      invoke: (cmd, args) => {
        calls.push({ cmd, args });
        return Promise.resolve();
      },
    });
    await client.setHeaders({ "X-Custom": "value" });
    expect(calls).toEqual([
      { cmd: "my_set_headers", args: { headers: { "X-Custom": "value" } } },
    ]);
  });

  it("setHeaders propagates rejected invoke errors unchanged", async () => {
    const error = new Error("invoke failed");
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: () => Promise.reject(error),
    });
    await expect(client.setHeaders({ Authorization: "Bearer x" })).rejects.toBe(
      error
    );
  });

  it("repeated setHeaders calls send full replacement sets", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: (cmd, args) => {
        calls.push({ cmd, args });
        return Promise.resolve();
      },
    });
    await client.setHeaders({ Authorization: "Bearer token-v1" });
    await client.setHeaders({ Authorization: "Bearer token-v2" });
    await client.setHeaders({
      Authorization: "Bearer token-v3",
      "X-Request-Id": "abc",
    });
    expect(calls).toEqual([
      {
        cmd: "plugin:baresync|set_headers",
        args: { headers: { Authorization: "Bearer token-v1" } },
      },
      {
        cmd: "plugin:baresync|set_headers",
        args: { headers: { Authorization: "Bearer token-v2" } },
      },
      {
        cmd: "plugin:baresync|set_headers",
        args: {
          headers: { Authorization: "Bearer token-v3", "X-Request-Id": "abc" },
        },
      },
    ]);
  });

  it("setHeaders does not include scopeId in args", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: (cmd, args) => {
        calls.push({ cmd, args });
        return Promise.resolve();
      },
    });
    await client.setHeaders({ Authorization: "Bearer abc" });
    expect(calls[0]?.args).not.toHaveProperty("scopeId");
  });
});

describe("enqueueChange upsert coalescing", () => {
  it("inserts a row when no pending outbox entry exists", async () => {
    const { db, sqlite } = createTestDb();
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: () => Promise.resolve({}),
    });

    await db.transaction(async (tx) => {
      await client.enqueueChange(tx, {
        operation: "insert",
        rowId: "item-1",
        table: testItems,
      });
    });

    const rows = sqlite
      .prepare("SELECT operation, row_id, table_name FROM sync_outbox")
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      operation: "insert",
      row_id: "item-1",
      table_name: "items",
    });
  });

  it("preserves insert operation when update follows insert for same row", async () => {
    const { db, sqlite } = createTestDb();
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: () => Promise.resolve({}),
    });

    await db.transaction(async (tx) => {
      await client.enqueueChange(tx, {
        operation: "insert",
        rowId: "item-1",
        table: testItems,
      });
      await client.enqueueChange(tx, {
        operation: "update",
        rowId: "item-1",
        table: testItems,
      });
    });

    const rows = sqlite
      .prepare(
        "SELECT operation, row_id FROM sync_outbox WHERE synced_at IS NULL"
      )
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.operation).toBe("insert");
  });

  it("uses new operation when update follows update for same row", async () => {
    const { db, sqlite } = createTestDb();
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: () => Promise.resolve({}),
    });

    await db.transaction(async (tx) => {
      await client.enqueueChange(tx, {
        operation: "update",
        rowId: "item-1",
        table: testItems,
      });
      await client.enqueueChange(tx, {
        operation: "update",
        rowId: "item-1",
        table: testItems,
      });
    });

    const rows = sqlite
      .prepare(
        "SELECT operation, row_id FROM sync_outbox WHERE synced_at IS NULL"
      )
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.operation).toBe("update");
  });

  it("inserts fresh row when previous entry is already synced", async () => {
    const { db, sqlite } = createTestDb();
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: () => Promise.resolve({}),
    });

    await db.transaction(async (tx) => {
      await client.enqueueChange(tx, {
        operation: "update",
        rowId: "item-1",
        table: testItems,
      });
    });
    sqlite
      .prepare(
        "UPDATE sync_outbox SET synced_at = '2026-01-01T00:00:00.000Z' WHERE row_id = 'item-1'"
      )
      .run();

    await db.transaction(async (tx) => {
      await client.enqueueChange(tx, {
        operation: "update",
        rowId: "item-1",
        table: testItems,
      });
    });

    const syncedAtValues = sqlite
      .prepare("SELECT synced_at FROM sync_outbox")
      .all()
      .map((r) => r.synced_at as string | null);
    expect(syncedAtValues).toHaveLength(2);
    expect(syncedAtValues).toContain(null);
    expect(syncedAtValues).toEqual(
      expect.arrayContaining([expect.any(String)])
    );
  });

  it("refreshes changedAt timestamp on conflict", async () => {
    const { db, sqlite } = createTestDb();
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: () => Promise.resolve({}),
    });

    await db.transaction(async (tx) => {
      await client.enqueueChange(tx, {
        operation: "insert",
        rowId: "item-1",
        table: testItems,
      });
    });

    const beforeConflict = sqlite
      .prepare("SELECT changed_at FROM sync_outbox")
      .get()?.changed_at as string;

    await new Promise((resolve) => setTimeout(resolve, 10));

    await db.transaction(async (tx) => {
      await client.enqueueChange(tx, {
        operation: "update",
        rowId: "item-1",
        table: testItems,
      });
    });

    const afterConflict = sqlite
      .prepare("SELECT changed_at FROM sync_outbox WHERE synced_at IS NULL")
      .get()?.changed_at as string;

    expect(afterConflict).not.toBe(beforeConflict);
  });

  it("preserves insert operation when insert follows insert for same row", async () => {
    const { db, sqlite } = createTestDb();
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: () => Promise.resolve({}),
    });

    await db.transaction(async (tx) => {
      await client.enqueueChange(tx, {
        operation: "insert",
        rowId: "item-1",
        table: testItems,
      });
      await client.enqueueChange(tx, {
        operation: "insert",
        rowId: "item-1",
        table: testItems,
      });
    });

    const rows = sqlite
      .prepare("SELECT operation FROM sync_outbox WHERE synced_at IS NULL")
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.operation).toBe("insert");
  });

  it("preserves original id and scopeId on conflict", async () => {
    const { db, sqlite } = createTestDb();
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: () => Promise.resolve({}),
    });

    await db.transaction(async (tx) => {
      await client.enqueueChange(tx, {
        operation: "insert",
        rowId: "item-1",
        table: testItems,
      });
    });

    const original = sqlite
      .prepare("SELECT id, scope_id FROM sync_outbox")
      .get() as { id: string; scope_id: string };

    await db.transaction(async (tx) => {
      await client.enqueueChange(tx, {
        operation: "update",
        rowId: "item-1",
        table: testItems,
      });
    });

    const afterConflict = sqlite
      .prepare("SELECT id, scope_id FROM sync_outbox WHERE synced_at IS NULL")
      .get() as { id: string; scope_id: string };

    expect(afterConflict.id).toBe(original.id);
    expect(afterConflict.scope_id).toBe(original.scope_id);
  });

  it("does not conflict across different tables with same rowId", async () => {
    const { db, sqlite } = createTestDb();
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: () => Promise.resolve({}),
    });

    const testCategories = sqliteTable("categories", {
      id: text("id").primaryKey(),
    });

    await db.transaction(async (tx) => {
      await client.enqueueChange(tx, {
        operation: "insert",
        rowId: "shared-id",
        table: testItems,
      });
      await client.enqueueChange(tx, {
        operation: "insert",
        rowId: "shared-id",
        table: testCategories,
      });
    });

    const rows = sqlite
      .prepare(
        "SELECT table_name, operation FROM sync_outbox ORDER BY table_name"
      )
      .all();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      table_name: "categories",
      operation: "insert",
    });
    expect(rows[1]).toMatchObject({ table_name: "items", operation: "insert" });
  });

  it("coalesces three consecutive enqueues preserving the original insert", async () => {
    const { db, sqlite } = createTestDb();
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: () => Promise.resolve({}),
    });

    await db.transaction(async (tx) => {
      await client.enqueueChange(tx, {
        operation: "insert",
        rowId: "item-1",
        table: testItems,
      });
      await client.enqueueChange(tx, {
        operation: "update",
        rowId: "item-1",
        table: testItems,
      });
      await client.enqueueChange(tx, {
        operation: "update",
        rowId: "item-1",
        table: testItems,
      });
    });

    const rows = sqlite
      .prepare("SELECT operation FROM sync_outbox WHERE synced_at IS NULL")
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.operation).toBe("insert");
  });

  it("preserves insert operation across separate transactions", async () => {
    const { db, sqlite } = createTestDb();
    const client = createSyncClient({
      scopeId: "outlet-1",
      invoke: () => Promise.resolve({}),
    });

    await db.transaction(async (tx) => {
      await client.enqueueChange(tx, {
        operation: "insert",
        rowId: "item-1",
        table: testItems,
      });
    });

    await db.transaction(async (tx) => {
      await client.enqueueChange(tx, {
        operation: "update",
        rowId: "item-1",
        table: testItems,
      });
    });

    const rows = sqlite
      .prepare("SELECT operation FROM sync_outbox WHERE synced_at IS NULL")
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.operation).toBe("insert");
  });
});
