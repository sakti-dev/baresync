import { SYNC_SCOPE } from "@sync-contract/constants";
import { invoke } from "@tauri-apps/api/core";
import { createSyncClient } from "baresync";

export const syncClient = createSyncClient({
  scopeId: SYNC_SCOPE,
  invoke,
});

// --- Authenticated sync (optional) ---
//
// If your server requires authentication, attach headers before polling:
//
//   await syncClient.setHeaders({ Authorization: `Bearer ${token}` });
//   await syncClient.startPolling();
//
// On token refresh, call setHeaders again to replace the header:
//
//   await syncClient.setHeaders({ Authorization: `Bearer ${newToken}` });
//
// To clear all custom headers (e.g. on logout):
//
//   await syncClient.setHeaders({});
//
// Headers are plugin-wide — they apply to every sync request (push, pull, status).
// The client does not store or manage tokens; call setHeaders from your app's
// auth layer whenever credentials change.
