export interface SyncClientConfig {
  apiUrl: string;
  encoding: "json" | "protobuf";
  invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  scopeId: string;
}

export interface PollingStatus {
  last_sync_at: string | null;
  paused: boolean;
  running: boolean;
}

export interface SyncClient {
  fullResync(): Promise<unknown>;
  getPollingStatus(): Promise<PollingStatus>;
  getState(): Promise<{
    local_dirty_count: number;
    last_server_watermark: string;
    needs_baseline_sync: boolean;
  }>;
  pausePolling(): Promise<unknown>;
  pull(): Promise<unknown>;
  push(): Promise<unknown>;
  resumePolling(): Promise<unknown>;
  startPolling(): Promise<unknown>;
  stopPolling(): Promise<unknown>;
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
    startPolling() {
      return invoke("start_polling", { scopeId });
    },
    stopPolling() {
      return invoke("stop_polling");
    },
    pausePolling() {
      return invoke("pause_polling");
    },
    resumePolling() {
      return invoke("resume_polling");
    },
    getPollingStatus() {
      return invoke("get_polling_status") as Promise<PollingStatus>;
    },
  };
}
