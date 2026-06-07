import { SYNC_SCOPE } from "@sync-contract/constants";
import { type QueryKey, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createSyncClient, type SyncClient } from "baresync/tauri";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

interface UseQueryResult<Row> {
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  rows: Row[];
}

type QueryBuilder<Row> = () => PromiseLike<Row[]>;

interface InventoryRuntimeConfig {
  api_url: string;
  auth_token: string | null;
}

const SyncClientContext = createContext<SyncClient | null>(null);

export function SyncClientProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [client] = useState(() =>
    createSyncClient({
      scopeId: SYNC_SCOPE,
      invoke,
    })
  );

  // To attach auth headers (e.g. after login or token refresh), call:
  //   client.setHeaders({ Authorization: `Bearer ${token}` });
  // This replaces all custom headers on every sync request.
  // Call client.setHeaders({}) to clear them.

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const runtimeConfig = (await invoke(
          "get_inventory_runtime_config"
        )) as InventoryRuntimeConfig;
        if (cancelled) {
          return;
        }

        await client.setHeaders(
          runtimeConfig.auth_token
            ? { Authorization: `Bearer ${runtimeConfig.auth_token}` }
            : {}
        );
        await client.startPolling();
        await queryClient.invalidateQueries({ queryKey: ["sync-state"] });
      } catch (err) {
        console.error("[baresync] inventory bootstrap failed:", err);
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
      client.stopPolling().catch(() => {});
    };
  }, [client, queryClient]);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => Promise<void> | void) | null = null;

    const pending = Promise.all([
      listen("baresync://data-changed", async () => {
        await queryClient.invalidateQueries({ queryKey: ["inventory"] });
        await queryClient.invalidateQueries({ queryKey: ["sync-state"] });
      }),
      listen("baresync://sync-status-changed", async () => {
        await queryClient.invalidateQueries({ queryKey: ["sync-state"] });
      }),
    ]).then(([unlistenDataChanged, unlistenStatusChanged]) => {
      const release = async () => {
        await Promise.all([unlistenDataChanged(), unlistenStatusChanged()]);
      };

      if (disposed) {
        release();
        return;
      }
      cleanup = release;
    });
    pending.catch(() => undefined);

    return () => {
      disposed = true;
      if (cleanup) {
        cleanup();
      }
    };
  }, [queryClient]);

  return (
    <SyncClientContext.Provider value={client}>
      {children}
    </SyncClientContext.Provider>
  );
}

export function useSyncClient(): SyncClient {
  const client = useContext(SyncClientContext);
  if (!client) {
    throw new Error("useSyncClient must be used within SyncClientProvider");
  }
  return client;
}

export function useDrizzleQuery<Row>(
  queryKey: QueryKey,
  buildQuery: QueryBuilder<Row>
): UseQueryResult<Row> {
  const query = useQuery({
    queryKey,
    queryFn: async () => await buildQuery(),
  });

  return {
    error: query.error ? String(query.error) : null,
    loading: query.isPending,
    refresh: async () => {
      await query.refetch();
    },
    rows: query.data ?? [],
  };
}
