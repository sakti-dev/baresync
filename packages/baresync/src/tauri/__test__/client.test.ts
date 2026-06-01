import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { createSyncClient } from "../client.js";

const testItems = sqliteTable("items", {
  id: text("id").primaryKey(),
});

function createRecordingTx() {
  const inserted: Array<{ table: unknown; values: Record<string, unknown> }> =
    [];
  const tx = {
    insert(table: unknown) {
      return {
        values(values: Record<string, unknown>) {
          inserted.push({ table, values });
          return Promise.resolve({ rowsAffected: 1 });
        },
      };
    },
  };

  return { inserted, tx };
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
});
