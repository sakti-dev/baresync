import { getTableConfig } from "drizzle-orm/sqlite-core";
import type { SyncContract } from "../schema/contract";
import type { GeneratorConfig } from "./config";
import { computeSyncTableOrder } from "./fk-order";
import { writeSyncContractJson, writeTableOrderConstants } from "./outputs";

export type { GeneratorConfig } from "./config";
export { computeSyncTableOrder, type SyncTableOrder } from "./fk-order";

export function generateSyncArtifacts(config: GeneratorConfig): void;
export function generateSyncArtifacts(
  contract: SyncContract,
  outputDir: string
): void;
export function generateSyncArtifacts(
  configOrContract: GeneratorConfig | SyncContract,
  outputDir?: string
): void {
  let contract: SyncContract;
  let dir: string;

  if ("contract" in configOrContract) {
    contract = configOrContract.contract;
    dir = configOrContract.outputDir;
  } else {
    contract = configOrContract;
    dir = outputDir!;
  }

  const schemaModule: Record<string, unknown> = {};
  for (const t of contract.tables) {
    const config = getTableConfig(t.table);
    schemaModule[config.name] = t.table;
  }

  const tableOrder = computeSyncTableOrder({
    schemaModule,
    syncedTableNames: contract.tablesMeta.map((t) => t.tableName),
  });

  writeSyncContractJson(contract, tableOrder, dir);
  writeTableOrderConstants(tableOrder, dir);
}
