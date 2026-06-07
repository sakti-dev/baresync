import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { createElement, StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SyncClientProvider } from "../useBaresyncQuery";

const listen = vi.hoisted(() => vi.fn());
const createSyncClient = vi.hoisted(() => vi.fn());
const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("baresync/tauri", () => ({
  createSyncClient,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen,
}));

describe("SyncClientProvider event bridge", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function createClientMock() {
    return {
      setHeaders: vi.fn().mockResolvedValue(undefined),
      startPolling: vi.fn().mockResolvedValue(undefined),
      stopPolling: vi.fn().mockResolvedValue(undefined),
    };
  }

  function renderProvider(queryClient: QueryClient, strict = false) {
    const client = createClientMock();
    createSyncClient.mockReturnValue(client);
    invokeMock.mockResolvedValue({
      api_url: "http://127.0.0.1:3001/api/sync/v1",
      auth_token: null,
    });

    const provider = createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        SyncClientProvider,
        null,
        createElement("div", null, "child")
      )
    );

    return {
      client,
      view: render(
        strict ? createElement(StrictMode, null, provider) : provider
      ),
    };
  }

  it("invalidates inventory and sync-state queries when data changes", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);

    const listeners = new Map<
      string,
      (event: unknown) => void | Promise<void>
    >();
    listen.mockImplementation(
      (event: string, handler: (event: unknown) => void | Promise<void>) => {
        listeners.set(event, handler);
        return Promise.resolve(async () => {});
      }
    );

    renderProvider(queryClient);
    await waitFor(() => {
      expect(listeners.has("baresync://data-changed")).toBe(true);
    });

    await listeners.get("baresync://data-changed")?.(undefined);

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["inventory"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["sync-state"] });
  });

  it("invalidates only sync-state queries when sync status changes", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);

    const listeners = new Map<
      string,
      (event: unknown) => void | Promise<void>
    >();
    listen.mockImplementation(
      (event: string, handler: (event: unknown) => void | Promise<void>) => {
        listeners.set(event, handler);
        return Promise.resolve(async () => {});
      }
    );

    renderProvider(queryClient);
    await waitFor(() => {
      expect(listeners.has("baresync://sync-status-changed")).toBe(true);
    });

    await listeners.get("baresync://sync-status-changed")?.(undefined);

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["sync-state"] });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["inventory"] });
  });

  it("restarts polling after StrictMode effect cleanup", async () => {
    const queryClient = new QueryClient();
    listen.mockResolvedValue(async () => {});
    invokeMock.mockResolvedValue({
      api_url: "http://127.0.0.1:3001/api/sync/v1",
      auth_token: null,
    });

    const { client } = renderProvider(queryClient, true);

    await waitFor(() => {
      expect(client.startPolling).toHaveBeenCalledTimes(1);
    });
    expect(client.stopPolling).toHaveBeenCalledTimes(1);
  });

  it("sets auth headers before starting polling when the runtime token exists", async () => {
    const queryClient = new QueryClient();
    const calls: string[] = [];
    const client = createClientMock();
    client.setHeaders.mockImplementation(() => {
      calls.push("setHeaders");
      return Promise.resolve();
    });
    client.startPolling.mockImplementation(() => {
      calls.push("startPolling");
      return Promise.resolve();
    });
    createSyncClient.mockReturnValue(client);
    listen.mockResolvedValue(() => {});
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_inventory_runtime_config") {
        return Promise.resolve({
          api_url: "http://127.0.0.1:3001/api/sync/v1",
          auth_token: "demo-token",
        });
      }

      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          SyncClientProvider,
          null,
          createElement("div", null, "child")
        )
      )
    );

    await waitFor(() => {
      expect(client.startPolling).toHaveBeenCalled();
    });

    expect(invokeMock).toHaveBeenCalledWith("get_inventory_runtime_config");
    expect(client.setHeaders).toHaveBeenCalledWith({
      Authorization: "Bearer demo-token",
    });
    expect(calls).toEqual(["setHeaders", "startPolling"]);
  });
});
