import fs from "node:fs";
import path from "node:path";
import { type AnySQLiteTable, getTableConfig } from "drizzle-orm/sqlite-core";
import { isTable } from "drizzle-orm/table";
import type { SyncContract } from "../schema/contract";
import { syncSchema } from "../schema/contract";
import { syncedTable } from "../schema/synced-table";
import type { GeneratorConfig, PairedSyncGeneratorConfig } from "./config";
import { validatePairedTableColumns } from "./config";
import type { DiagnosticOptions, SyncDiagnostic } from "./diagnostics";
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

type SyncedSchemaModule = Record<
  string,
  import("drizzle-orm/sqlite-core").AnySQLiteTable
>;

interface PairedContractBuild {
  contract: SyncContract;
  tables: Array<{
    apiTable: AnySQLiteTable;
    exportName: string;
    localTable: AnySQLiteTable;
  }>;
}

function isPairedConfig(
  config: GeneratorConfig | PairedSyncGeneratorConfig | SyncContract
): config is PairedSyncGeneratorConfig {
  return (
    typeof config === "object" &&
    config !== null &&
    "apiSyncedSchemaPath" in config &&
    "localSyncedSchemaPath" in config
  );
}

function isGeneratorConfig(
  config: GeneratorConfig | PairedSyncGeneratorConfig | SyncContract
): config is GeneratorConfig {
  return (
    typeof config === "object" &&
    config !== null &&
    "contract" in config &&
    "outputDir" in config
  );
}

async function loadSchemaModule(
  schemaPath: string
): Promise<SyncedSchemaModule> {
  const resolved = path.resolve(schemaPath);
  const mod = (await import(resolved)) as Record<string, unknown>;
  const schema: SyncedSchemaModule = {};
  for (const [key, value] of Object.entries(mod)) {
    if (isTable(value)) {
      schema[key] = value as import("drizzle-orm/sqlite-core").AnySQLiteTable;
    }
  }
  return schema;
}

export async function buildPairedContractFromPairedConfig(
  config: PairedSyncGeneratorConfig
): Promise<PairedContractBuild> {
  const localModule = await loadSchemaModule(config.localSyncedSchemaPath);
  const apiModule = await loadSchemaModule(config.apiSyncedSchemaPath);

  const pairedTables: PairedContractBuild["tables"] = [];
  const tables = Object.entries(config.tables).map(([exportName, options]) => {
    if (!options) {
      throw new Error(
        `Sync table export "${exportName}" is missing table options.`
      );
    }

    const localTable = localModule[exportName];
    if (!localTable) {
      throw new Error(
        `Local synced schema is missing table export "${exportName}".`
      );
    }

    const apiTable = apiModule[exportName];
    if (!apiTable) {
      throw new Error(
        `API synced schema is missing table export "${exportName}".`
      );
    }

    const localOnlyColumns = options.localOnlyColumns ?? ["isSynced"];
    const serverOnlyColumns = options.serverOnlyColumns ?? ["syncUpdatedAt"];

    validatePairedTableColumns({
      apiTable,
      exportName,
      localOnlyColumns,
      localTable,
      serverOnlyColumns,
    });

    pairedTables.push({ apiTable, exportName, localTable });

    return syncedTable(localTable, {
      scope: options.scopeColumn,
      localOnlyColumns: [...localOnlyColumns],
      serverOnlyColumns: [...serverOnlyColumns],
    });
  });

  return {
    contract: syncSchema({
      limits: config.limits,
      tables,
    }),
    tables: pairedTables,
  };
}

export async function buildContractFromPairedConfig(
  config: PairedSyncGeneratorConfig
): Promise<SyncContract> {
  const build = await buildPairedContractFromPairedConfig(config);
  return build.contract;
}

function writeGenerationArtifacts(
  contract: SyncContract,
  dir: string,
  options?: GenerateOptions,
  schemaPaths?: { apiPath: string; localPath: string },
  diagnosticOptions?: DiagnosticOptions
): void {
  const diagnostics = runDiagnostics(contract, diagnosticOptions);
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

  if (schemaPaths) {
    const snapshotPairs: [string, string][] = [
      [schemaPaths.apiPath, "api-synced-schema.ts"],
      [schemaPaths.localPath, "local-synced-schema.ts"],
    ];
    for (const [srcPath, destName] of snapshotPairs) {
      const resolved = path.resolve(srcPath);
      if (fs.existsSync(resolved)) {
        fs.copyFileSync(resolved, path.join(datedDir, destName));
      } else {
        console.error(
          `[baresync warning] Schema snapshot file not found: ${resolved}. Skipping copy.`
        );
      }
    }
  } else {
    console.error(
      "[baresync warning] Schema file paths not provided. Frozen schema snapshots (api-synced-schema.ts, local-synced-schema.ts) will not be generated. Server imports from @sync-contract/generated/<date>/api-synced-schema will fail."
    );
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

export async function generateSyncArtifacts(
  config: PairedSyncGeneratorConfig
): Promise<void>;
export function generateSyncArtifacts(config: GeneratorConfig): void;
export function generateSyncArtifacts(
  contract: SyncContract,
  outputDir: string,
  options?: GenerateOptions
): void;
export function generateSyncArtifacts(
  configOrContract: GeneratorConfig | PairedSyncGeneratorConfig | SyncContract,
  outputDir?: string,
  options?: GenerateOptions
): void | Promise<void> {
  if (isPairedConfig(configOrContract)) {
    return (async () => {
      const build = await buildPairedContractFromPairedConfig(configOrContract);
      const { contract } = build;
      writeGenerationArtifacts(
        contract,
        configOrContract.outputDir,
        undefined,
        {
          apiPath: configOrContract.apiSyncedSchemaPath,
          localPath: configOrContract.localSyncedSchemaPath,
        },
        { pairedTables: build.tables }
      );
    })();
  }

  let contract: SyncContract;
  let dir: string;

  if (isGeneratorConfig(configOrContract)) {
    contract = configOrContract.contract;
    dir = configOrContract.outputDir;
  } else {
    contract = configOrContract;
    dir = outputDir!;
  }

  writeGenerationArtifacts(contract, dir, options);
}
