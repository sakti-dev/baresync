import fs from "node:fs";
import path from "node:path";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import type { SyncContract } from "../schema/contract";
import type { GeneratorConfig, PairedSyncGeneratorConfig } from "./config";
import type { SyncDiagnostic } from "./diagnostics";
import { runDiagnostics } from "./diagnostics";
import { computeSyncTableOrder } from "./fk-order";
import { formatGeneratedArtifacts } from "./formatter";
import { writeManifest } from "./manifest";
import { writeSyncContractJson, writeTableOrderConstants } from "./outputs";

export {
  defineSyncConfig,
  type GeneratorConfig,
  type PairedSyncGeneratorConfig,
  type SyncConfigTableOptions,
  type SyncConfigTables,
} from "./config.js";
export { runDiagnostics, type SyncDiagnostic } from "./diagnostics.js";
export { computeSyncTableOrder, type SyncTableOrder } from "./fk-order.js";
export { type SyncManifest, writeManifest } from "./manifest.js";

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

export function generateSyncArtifacts(
  config: GeneratorConfig | PairedSyncGeneratorConfig
): void;
export function generateSyncArtifacts(
  contract: SyncContract,
  outputDir: string,
  options?: GenerateOptions
): void;
export function generateSyncArtifacts(
  configOrContract: GeneratorConfig | PairedSyncGeneratorConfig | SyncContract,
  outputDir?: string,
  options?: GenerateOptions
): void {
  let contract: SyncContract;
  let dir: string;
  let schemaSourceDir: string | undefined;

  if ("contract" in configOrContract) {
    contract = configOrContract.contract;
    dir = configOrContract.outputDir;
    schemaSourceDir =
      "schemaSourceDir" in configOrContract
        ? configOrContract.schemaSourceDir
        : undefined;
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

  const today = new Date().toISOString().slice(0, 10);
  const datedDir = path.join(dir, today);

  writeSyncContractJson(contract, tableOrder, datedDir, today);
  writeTableOrderConstants(tableOrder, datedDir);
  writeManifest(contract, tableOrder, datedDir, today);

  if (schemaSourceDir) {
    const schemaFiles = ["api-synced-schema.ts", "local-synced-schema.ts"];
    for (const file of schemaFiles) {
      const src = path.join(schemaSourceDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(datedDir, file));
      } else {
        console.error(
          `[baresync warning] Schema snapshot file not found: ${src}. Skipping copy.`
        );
      }
    }
  }

  formatGeneratedArtifacts({
    projectDir: process.cwd(),
    tsAndJson: [
      path.join(datedDir, "sync-contract.json"),
      path.join(datedDir, "sync-contract.manifest.json"),
      path.join(datedDir, "sync-table-order.ts"),
    ],
  });
}
