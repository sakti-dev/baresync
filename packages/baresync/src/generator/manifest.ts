import fs from "node:fs";
import path from "node:path";
import type { SyncContract } from "../schema/contract";
import type { SyncTableOrder } from "./fk-order";

export interface SyncManifest {
  contractVersion: number;
  encoding: string;
  generatorVersion: string;
  outputPaths: string[];
  packageName: string;
  scopeMappings: Array<{ field: string; table: string }>;
  tableOrder: { delete: string[]; upsert: string[] };
  tables: Array<{
    fieldNumbers: Record<string, number>;
    fields: string[];
    name: string;
  }>;
}

const GENERATOR_VERSION = "0.1.0";

export function writeManifest(
  contract: SyncContract,
  tableOrder: SyncTableOrder,
  outputDir: string,
  outputPaths: string[] = [
    "sync-contract.json",
    "sync-table-order.ts",
    "sync-contract.manifest.json",
  ]
): void {
  fs.mkdirSync(outputDir, { recursive: true });

  const manifest: SyncManifest = {
    contractVersion: 1,
    generatorVersion: GENERATOR_VERSION,
    encoding: contract.encoding,
    packageName: contract.packageName,
    tables: contract.tablesMeta.map((t) => ({
      fieldNumbers: Object.fromEntries(
        t.columns.map((column, index) => [column, index + 1])
      ),
      name: t.tableName,
      fields: t.columns,
    })),
    scopeMappings: contract.tablesMeta.map((t) => ({
      table: t.tableName,
      field: t.scope.field,
    })),
    tableOrder: {
      upsert: tableOrder.upsertOrder,
      delete: tableOrder.deleteOrder,
    },
    outputPaths,
  };

  const manifestPath = path.join(outputDir, "sync-contract.manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
