// biome-ignore lint/performance/noNamespaceImport: keep the schema namespace intact for TABLE spreading
import * as localSchema from "@sync-contract/local-schema";
// biome-ignore lint/performance/noNamespaceImport: keep the schema namespace intact for TABLE spreading
import * as localSyncedSchema from "@sync-contract/local-synced-schema";
import { invoke } from "@tauri-apps/api/core";
import { createTauriDrizzleDatabase } from "baresync/db";

export const TABLE = {
  ...localSyncedSchema,
  ...localSchema,
};

export const db = createTauriDrizzleDatabase({
  schema: TABLE,
  invoke,
});
