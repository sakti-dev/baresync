import {
  syncCursors,
  syncOutbox,
} from "@example/inventory-sync-contract/local-schema";
import {
  items,
  locations,
  stockCounts,
} from "@example/inventory-sync-contract/local-synced-schema";
import { invoke } from "@tauri-apps/api/core";
import { createTauriDrizzleDatabase } from "baresync/db";

export const TABLE = {
  items,
  locations,
  stockCounts,
  syncCursors,
  syncOutbox,
};

export const db = createTauriDrizzleDatabase({
  schema: TABLE,
  invoke,
});
