import { useQuery } from "@tanstack/react-query";
import { useSyncClient } from "./useBaresyncQuery";

interface SyncLocalState {
  last_server_watermark: string;
  local_dirty_count: number;
  needs_baseline_sync: boolean;
}

interface PollingStatus {
  last_sync_at: string | null;
  paused: boolean;
  running: boolean;
}

interface SyncStateResult {
  loading: boolean;
  localState: SyncLocalState | null;
  pollingStatus: PollingStatus | null;
  refresh: () => Promise<void>;
}

export function useSyncState(): SyncStateResult {
  const client = useSyncClient();
  const query = useQuery({
    queryKey: ["sync-state"],
    queryFn: async () => {
      const [localState, pollingStatus] = await Promise.all([
        client.getState(),
        client.getPollingStatus().catch(() => null),
      ]);
      return { localState, pollingStatus };
    },
  });

  return {
    localState: query.data?.localState ?? null,
    pollingStatus: query.data?.pollingStatus ?? null,
    loading: query.isPending,
    refresh: async () => {
      await query.refetch();
    },
  };
}
