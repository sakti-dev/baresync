import { invoke } from "@tauri-apps/api/core";
import { createTauriDrizzleDatabase } from "baresync";
import * as localSchema from "../../../../packages/sync-contract/src/local-schema";
import * as localSyncedSchema from "../../../../packages/sync-contract/src/local-synced-schema";

export const TABLE = {
  ...localSyncedSchema,
  ...localSchema,
};

export const db = createTauriDrizzleDatabase({
  invoke,
  schema: TABLE,
});
