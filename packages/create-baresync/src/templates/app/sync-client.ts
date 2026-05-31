import { SYNC_SCOPE } from "@baresync/sync-contract/constants";
import { createSyncClient } from "baresync/tauri";

export function createAppSyncClient(
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
) {
  return createSyncClient({
    apiUrl: "http://127.0.0.1:3001",
    encoding: "json",
    scopeId: SYNC_SCOPE,
    invoke,
  });
}
