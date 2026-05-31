import { INVENTORY_SCOPE_ID } from "@example/inventory-sync-contract/constants";
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

const SyncClientContext = createContext<SyncClient | null>(null);

export function SyncClientProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [client] = useState(() =>
    createSyncClient({
      apiUrl: "http://127.0.0.1:3001",
      encoding: "json",
      scopeId: INVENTORY_SCOPE_ID,
      invoke,
    })
  );

  useEffect(() => {
    client
      .startPolling()
      .then(async () => {
        await queryClient.invalidateQueries({ queryKey: ["sync-state"] });
      })
      .catch(() => {});

    return () => {
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
