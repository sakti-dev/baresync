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
    expect(typeof client.syncNow).toBe("function");
    expect(typeof client.push).toBe("function");
    expect(typeof client.pull).toBe("function");
    expect(typeof client.fullResync).toBe("function");
    expect(typeof client.getState).toBe("function");
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
});
