import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SyncClientProvider } from "../useBaresyncQuery";

const listen = vi.hoisted(() => vi.fn());
const createSyncClient = vi.hoisted(() => vi.fn());

vi.mock("baresync/tauri", () => ({
  createSyncClient,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen,
}));

describe("SyncClientProvider event bridge", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function renderProvider(queryClient: QueryClient) {
    createSyncClient.mockReturnValue({
      startPolling: vi.fn(),
      stopPolling: vi.fn().mockResolvedValue(undefined),
    });

    return render(
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
});
