import fs from "node:fs";
import {
  type AnySQLiteTable,
  getTableConfig,
  type SQLiteColumn,
} from "drizzle-orm/sqlite-core";
import type { SyncContract, SyncContractLimits } from "../schema/contract";

export interface GeneratorConfig {
  contract: SyncContract;
  outputDir: string;
}

export interface SyncConfigTableOptions {
  localOnlyColumns?: readonly string[];
  scopeColumn: string;
  serverOnlyColumns?: readonly string[];
}

export type SyncConfigTables = Record<
  string,
  SyncConfigTableOptions | undefined
>;

export interface PairedSyncGeneratorConfig {
  apiSyncedSchemaPath: string;
  limits?: Partial<SyncContractLimits>;
  localSyncedSchemaPath: string;
  outputDir: string;
  tables: SyncConfigTables;
}

export function defineSyncConfig(input: {
  apiSyncedSchema: string;
  limits?: Partial<SyncContractLimits>;
  localSyncedSchema: string;
  outputDir: string;
  tables: SyncConfigTables;
}): PairedSyncGeneratorConfig {
  if (!fs.existsSync(input.apiSyncedSchema)) {
    throw new Error(
      `API synced schema file not found: ${input.apiSyncedSchema}`
    );
  }

  if (!fs.existsSync(input.localSyncedSchema)) {
    throw new Error(
      `Local synced schema file not found: ${input.localSyncedSchema}`
    );
  }

  return {
    apiSyncedSchemaPath: input.apiSyncedSchema,
    localSyncedSchemaPath: input.localSyncedSchema,
    outputDir: input.outputDir,
    tables: input.tables,
    limits: input.limits,
  };
}

export function validatePairedTableColumns(input: {
  apiTable: AnySQLiteTable;
  exportName: string;
  localOnlyColumns: readonly string[];
  localTable: AnySQLiteTable;
  serverOnlyColumns: readonly string[];
}) {
  const localColumns = getColumnNames(input.localTable);
  const apiColumns = getColumnNames(input.apiTable);
  const localOnly = namesWithColumnAliases(input.localOnlyColumns);
  const serverOnly = namesWithColumnAliases(input.serverOnlyColumns);

  for (const column of localColumns) {
    if (!(apiColumns.has(column) || localOnly.has(column))) {
      throw new Error(
        `Table "${input.exportName}" has unexpected local-only column "${column}". ` +
          "Add it to localOnlyColumns or add a matching API column."
      );
    }
  }

  for (const column of apiColumns) {
    if (!(localColumns.has(column) || serverOnly.has(column))) {
      throw new Error(
        `Table "${input.exportName}" has unexpected server-only column "${column}". ` +
          "Add it to serverOnlyColumns or add a matching local column."
      );
    }
  }
}

export function getColumnNames(table: AnySQLiteTable): Set<string> {
  return new Set(
    (getTableConfig(table).columns as SQLiteColumn[]).map(
      (column) => column.name
    )
  );
}

function namesWithColumnAliases(names: readonly string[]): Set<string> {
  const aliases = new Set<string>();
  for (const name of names) {
    aliases.add(name);
    aliases.add(camelToSnake(name));
  }
  return aliases;
}

function camelToSnake(s: string): string {
  const result = s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  return result.startsWith("_") ? result.slice(1) : result;
}
