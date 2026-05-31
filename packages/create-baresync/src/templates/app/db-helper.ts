import { createTauriDrizzleDatabase } from "baresync/db";
import {
  syncCursors,
  syncOutbox,
} from "../../../packages/sync-contract/src/local-schema";

const schema = {
  syncCursors,
  syncOutbox,
};

export function createAppDatabase(
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
) {
  return createTauriDrizzleDatabase({
    invoke,
    schema,
  });
}
