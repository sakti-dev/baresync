import path from "node:path";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import type { SyncContract } from "../schema/contract";
import type { GeneratorConfig } from "./config";
import type { SyncDiagnostic } from "./diagnostics";
import { runDiagnostics } from "./diagnostics";
import { computeSyncTableOrder } from "./fk-order";
import { formatGeneratedArtifacts } from "./formatter";
import { writeManifest } from "./manifest";
import { writeSyncContractJson, writeTableOrderConstants } from "./outputs";

export {
  defineProtobufSyncConfig,
  defineSyncConfig,
  type GeneratorConfig,
  type PairedSyncGeneratorConfig,
  type ProtobufSyncGeneratorConfigInput,
  type SyncConfigTableOptions,
  type SyncConfigTables,
} from "./config.js";
export { runDiagnostics, type SyncDiagnostic } from "./diagnostics.js";
export { computeSyncTableOrder, type SyncTableOrder } from "./fk-order.js";
export { type SyncManifest, writeManifest } from "./manifest.js";
export {
  generateProtobufWorkspaceArtifacts,
  type ProtobufWorkspaceConfig,
  type ProtobufWorkspaceOutputs,
} from "./protobuf-workspace.js";

export interface GenerateOptions {
  check?: boolean;
  warningsAsErrors?: boolean;
}

export class SyncDiagnosticError extends Error {
  diagnostics: SyncDiagnostic[];

  constructor(diagnostics: SyncDiagnostic[]) {
    const errorCount = diagnostics.filter((d) => d.severity === "error").length;
    const warningCount = diagnostics.filter(
      (d) => d.severity === "warning"
    ).length;
    super(
      `Sync diagnostics failed: ${errorCount} error(s), ${warningCount} warning(s)`
    );
    this.name = "SyncDiagnosticError";
    this.diagnostics = diagnostics;
  }
}

export function generateSyncArtifacts(config: GeneratorConfig): void;
export function generateSyncArtifacts(
  contract: SyncContract,
  outputDir: string,
  options?: GenerateOptions
): void;
export function generateSyncArtifacts(
  configOrContract: GeneratorConfig | SyncContract,
  outputDir?: string,
  options?: GenerateOptions
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

  const diagnostics = runDiagnostics(contract);
  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");

  if (options?.warningsAsErrors) {
    errors.push(...warnings);
  }

  for (const w of warnings) {
    console.error(`[baresync warning] ${w.code}: ${w.message}`);
  }

  if (errors.length > 0) {
    throw new SyncDiagnosticError(diagnostics);
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
  writeManifest(contract, tableOrder, dir);
  formatGeneratedArtifacts({
    projectDir: process.cwd(),
    tsAndJson: [
      path.join(dir, "sync-contract.json"),
      path.join(dir, "sync-contract.manifest.json"),
      path.join(dir, "sync-table-order.ts"),
    ],
  });
}
