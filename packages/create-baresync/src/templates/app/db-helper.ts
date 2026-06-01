import { createTauriDrizzleDatabase } from "baresync/db";
import { lists, todos } from "../../../packages/sync-contract/src/local-synced-schema";
import {
  syncCursors,
  syncOutbox,
} from "../../../packages/sync-contract/src/local-schema";

export const TABLE = {
  lists,
  todos,
  syncCursors,
  syncOutbox,
};

export function createAppDatabase(
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
) {
  return createTauriDrizzleDatabase({
    invoke,
    schema: TABLE,
  });
}
