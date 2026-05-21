import { describe, expect, it } from "vitest";
import { createSyncClient } from "../client.js";

describe("createSyncClient", () => {
  it("returns client with all methods", () => {
    const client = createSyncClient({
      apiUrl: "https://api.example.com",
      encoding: "json",
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
  });

  it("syncNow calls invoke with sync_now command", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const client = createSyncClient({
      apiUrl: "https://api.example.com",
      encoding: "json",
      scopeId: "outlet-1",
      invoke: (cmd, args) => {
        calls.push({ cmd, args });
        return Promise.resolve({});
      },
    });
    await client.syncNow();
    expect(calls).toEqual([{ cmd: "sync_now", args: { scopeId: "outlet-1" } }]);
  });

  it("push calls invoke with sync_push command", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const client = createSyncClient({
      apiUrl: "https://api.example.com",
      encoding: "json",
      scopeId: "outlet-1",
      invoke: (cmd, args) => {
        calls.push({ cmd, args });
        return Promise.resolve({});
      },
    });
    await client.push();
    expect(calls).toEqual([
      { cmd: "sync_push", args: { scopeId: "outlet-1" } },
    ]);
  });

  it("pull calls invoke with sync_pull command", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const client = createSyncClient({
      apiUrl: "https://api.example.com",
      encoding: "json",
      scopeId: "outlet-1",
      invoke: (cmd, args) => {
        calls.push({ cmd, args });
        return Promise.resolve({});
      },
    });
    await client.pull();
    expect(calls).toEqual([
      { cmd: "sync_pull", args: { scopeId: "outlet-1" } },
    ]);
  });

  it("fullResync calls invoke with sync_full_resync command", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const client = createSyncClient({
      apiUrl: "https://api.example.com",
      encoding: "json",
      scopeId: "outlet-1",
      invoke: (cmd, args) => {
        calls.push({ cmd, args });
        return Promise.resolve({});
      },
    });
    await client.fullResync();
    expect(calls).toEqual([
      { cmd: "sync_full_resync", args: { scopeId: "outlet-1" } },
    ]);
  });

  it("getState calls invoke with get_sync_local_state command", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const client = createSyncClient({
      apiUrl: "https://api.example.com",
      encoding: "json",
      scopeId: "outlet-1",
      invoke: (cmd, args) => {
        calls.push({ cmd, args });
        return Promise.resolve({});
      },
    });
    await client.getState();
    expect(calls).toEqual([
      { cmd: "get_sync_local_state", args: { scopeId: "outlet-1" } },
    ]);
  });

  it("uses custom invoke for testability", async () => {
    let called = false;
    const client = createSyncClient({
      apiUrl: "https://api.example.com",
      encoding: "json",
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
      sync_now: { ok: true, method: "syncNow" },
      sync_push: { ok: true, method: "push" },
      sync_pull: { ok: true, method: "pull" },
      sync_full_resync: { ok: true, method: "fullResync" },
      get_sync_local_state: {
        local_dirty_count: 2,
        last_server_watermark: "sync:phase14",
        needs_baseline_sync: false,
      },
    };
    const client = createSyncClient({
      apiUrl: "https://api.example.com",
      encoding: "json",
      scopeId: "outlet-1",
      invoke: (cmd) => Promise.resolve(results[cmd]),
    });

    await expect(client.syncNow()).resolves.toBe(results.sync_now);
    await expect(client.push()).resolves.toBe(results.sync_push);
    await expect(client.pull()).resolves.toBe(results.sync_pull);
    await expect(client.fullResync()).resolves.toBe(results.sync_full_resync);
    await expect(client.getState()).resolves.toBe(results.get_sync_local_state);
  });

  it("propagates rejected mocked invoke errors unchanged", async () => {
    const error = new Error("device invoke failed");
    const client = createSyncClient({
      apiUrl: "https://api.example.com",
      encoding: "json",
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
      apiUrl: "https://api.example.com",
      encoding: "json",
      scopeId: "outlet-1",
      invoke: () => Promise.reject(error),
    });

    await expect(client.syncNow()).rejects.toBe(error);
  });

  it("preserves command argument shape across all sync methods", async () => {
    const calls: Array<{ args?: Record<string, unknown>; cmd: string }> = [];
    const client = createSyncClient({
      apiUrl: "https://api.example.com",
      encoding: "json",
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
      { cmd: "sync_now", args: { scopeId: "outlet-1" } },
      { cmd: "sync_push", args: { scopeId: "outlet-1" } },
      { cmd: "sync_pull", args: { scopeId: "outlet-1" } },
      { cmd: "sync_full_resync", args: { scopeId: "outlet-1" } },
      { cmd: "get_sync_local_state", args: { scopeId: "outlet-1" } },
    ]);
  });

  it("throws descriptive error without Tauri runtime", async () => {
    const client = createSyncClient({
      apiUrl: "https://api.example.com",
      encoding: "json",
      scopeId: "test",
    });
    await expect(client.syncNow()).rejects.toThrow(
      "Tauri IPC is not available"
    );
  });

  it("startPolling calls invoke with start_polling command", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const client = createSyncClient({
      apiUrl: "https://api.example.com",
      encoding: "json",
      scopeId: "outlet-1",
      invoke: (cmd, args) => {
        calls.push({ cmd, args });
        return Promise.resolve({});
      },
    });
    await client.startPolling();
    expect(calls).toEqual([
      { cmd: "start_polling", args: { scopeId: "outlet-1" } },
    ]);
  });

  it("stopPolling calls invoke without scopeId", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const client = createSyncClient({
      apiUrl: "https://api.example.com",
      encoding: "json",
      scopeId: "outlet-1",
      invoke: (cmd, args) => {
        calls.push({ cmd, args });
        return Promise.resolve({});
      },
    });
    await client.stopPolling();
    expect(calls).toEqual([{ cmd: "stop_polling" }]);
  });

  it("pausePolling and resumePolling call correct commands", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const client = createSyncClient({
      apiUrl: "https://api.example.com",
      encoding: "json",
      scopeId: "outlet-1",
      invoke: (cmd, args) => {
        calls.push({ cmd, args });
        return Promise.resolve({});
      },
    });
    await client.pausePolling();
    await client.resumePolling();
    expect(calls).toEqual([
      { cmd: "pause_polling" },
      { cmd: "resume_polling" },
    ]);
  });

  it("getPollingStatus calls invoke with get_polling_status", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const client = createSyncClient({
      apiUrl: "https://api.example.com",
      encoding: "json",
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
    expect(calls).toEqual([{ cmd: "get_polling_status" }]);
    expect(status).toEqual({
      running: false,
      paused: false,
      last_sync_at: null,
    });
  });

  it("polling methods propagate errors unchanged", async () => {
    const error = new Error("polling failed");
    const client = createSyncClient({
      apiUrl: "https://api.example.com",
      encoding: "json",
      scopeId: "outlet-1",
      invoke: () => Promise.reject(error),
    });
    await expect(client.startPolling()).rejects.toBe(error);
    await expect(client.stopPolling()).rejects.toBe(error);
    await expect(client.pausePolling()).rejects.toBe(error);
    await expect(client.resumePolling()).rejects.toBe(error);
    await expect(client.getPollingStatus()).rejects.toBe(error);
  });
});
