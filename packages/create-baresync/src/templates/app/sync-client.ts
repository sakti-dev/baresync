import { SYNC_SCOPE } from "@sync-contract/constants";
import { createSyncClient } from "baresync/tauri";

export function createAppSyncClient(
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
) {
  return createSyncClient({
    scopeId: SYNC_SCOPE,
    invoke,
  });
}
