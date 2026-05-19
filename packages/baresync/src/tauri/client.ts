export interface SyncClientConfig {
  apiUrl: string;
  encoding: "json" | "protobuf";
  invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  scopeId: string;
}

export interface SyncClient {
  fullResync(): Promise<unknown>;
  getState(): Promise<{
    local_dirty_count: number;
    last_server_watermark: string;
    needs_baseline_sync: boolean;
  }>;
  pull(): Promise<unknown>;
  push(): Promise<unknown>;
  syncNow(): Promise<unknown>;
}

function createDefaultInvoke(): (
  cmd: string,
  args?: Record<string, unknown>
) => Promise<unknown> {
  return (cmd: string) =>
    Promise.reject(
      new Error(
        `Tauri IPC is not available. Cannot invoke "${cmd}". ` +
          "Provide a custom `invoke` function in createSyncClient config, " +
          "or run within a Tauri application."
      )
    );
}

export function createSyncClient(config: SyncClientConfig): SyncClient {
  const invoke = config.invoke ?? createDefaultInvoke();
  const scopeId = config.scopeId;

  return {
    syncNow() {
      return invoke("sync_now", { scopeId });
    },
    push() {
      return invoke("sync_push", { scopeId });
    },
    pull() {
      return invoke("sync_pull", { scopeId });
    },
    fullResync() {
      return invoke("sync_full_resync", { scopeId });
    },
    getState() {
      return invoke("get_sync_local_state", { scopeId }) as Promise<{
        local_dirty_count: number;
        last_server_watermark: string;
        needs_baseline_sync: boolean;
      }>;
    },
  };
}
