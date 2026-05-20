import {
  type AnySQLiteTable,
  getTableConfig,
  type SQLiteColumn,
} from "drizzle-orm/sqlite-core";
import {
  type SyncContract,
  type SyncContractLimits,
  type SyncEncoding,
  syncSchema,
} from "../schema/contract";
import { syncedTable } from "../schema/synced-table";
import type {
  ProtobufWorkspaceConfig,
  ProtobufWorkspaceOutputs,
} from "./protobuf-workspace";

export interface GeneratorConfig {
  contract: SyncContract;
  outputDir: string;
}

type SyncedSchemaModule = Record<string, AnySQLiteTable>;
type SharedSchemaKey<
  LocalSchema extends SyncedSchemaModule,
  ApiSchema extends SyncedSchemaModule,
> = Extract<keyof LocalSchema, keyof ApiSchema>;

export interface SyncConfigTableOptions {
  localOnlyColumns?: readonly string[];
  scope: string;
  serverOnlyColumns?: readonly string[];
}

export type SyncConfigTables<
  LocalSchema extends SyncedSchemaModule,
  ApiSchema extends SyncedSchemaModule,
> = {
  [Key in SharedSchemaKey<LocalSchema, ApiSchema>]?: SyncConfigTableOptions;
};

export interface PairedSyncGeneratorConfig extends GeneratorConfig {
  apiSyncedSchema: SyncedSchemaModule;
  localSyncedSchema: SyncedSchemaModule;
}

export interface ProtobufSyncGeneratorConfigInput<
  LocalSchema extends SyncedSchemaModule,
  ApiSchema extends SyncedSchemaModule,
> {
  apiSyncedSchema: ApiSchema;
  limits?: Partial<SyncContractLimits>;
  localSyncedSchema: LocalSchema;
  outputDir: string;
  outputs: ProtobufWorkspaceOutputs;
  packageName: string;
  tables: SyncConfigTables<LocalSchema, ApiSchema>;
}

interface PairedSyncConfigInput<
  LocalSchema extends SyncedSchemaModule,
  ApiSchema extends SyncedSchemaModule,
> {
  apiSyncedSchema: ApiSchema;
  encoding?: SyncEncoding;
  limits?: Partial<SyncContractLimits>;
  localSyncedSchema: LocalSchema;
  outputDir: string;
  packageName: string;
  tables: SyncConfigTables<LocalSchema, ApiSchema>;
}

function buildPairedSyncConfig<
  LocalSchema extends SyncedSchemaModule,
  ApiSchema extends SyncedSchemaModule,
>(
  input: PairedSyncConfigInput<LocalSchema, ApiSchema>
): PairedSyncGeneratorConfig {
  const tables = input.tables as Record<string, SyncConfigTableOptions>;
  const tableDefinitions = Object.entries(tables).map(
    ([exportName, options]) => {
      if (!options) {
        throw new Error(
          `Sync table export "${exportName}" is missing table options.`
        );
      }

      const localTable = input.localSyncedSchema[exportName];
      if (!localTable) {
        throw new Error(
          `Local synced schema is missing table export "${exportName}".`
        );
      }

      const apiTable = input.apiSyncedSchema[exportName];
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

      return syncedTable(localTable, {
        scope: options.scope,
        localOnlyColumns: [...localOnlyColumns],
        serverOnlyColumns: [...serverOnlyColumns],
      });
    }
  );

  return {
    apiSyncedSchema: input.apiSyncedSchema,
    contract: syncSchema({
      encoding: input.encoding,
      limits: input.limits,
      packageName: input.packageName,
      tables: tableDefinitions,
    }),
    localSyncedSchema: input.localSyncedSchema,
    outputDir: input.outputDir,
  };
}

export function defineSyncConfig<
  LocalSchema extends SyncedSchemaModule,
  ApiSchema extends SyncedSchemaModule,
>(input: {
  apiSyncedSchema: ApiSchema;
  encoding?: SyncEncoding;
  limits?: Partial<SyncContractLimits>;
  localSyncedSchema: LocalSchema;
  outputDir: string;
  packageName: string;
  tables: SyncConfigTables<LocalSchema, ApiSchema>;
}): PairedSyncGeneratorConfig {
  return buildPairedSyncConfig(input);
}

export function defineProtobufSyncConfig<
  LocalSchema extends SyncedSchemaModule,
  ApiSchema extends SyncedSchemaModule,
>(
  input: ProtobufSyncGeneratorConfigInput<LocalSchema, ApiSchema>
): ProtobufWorkspaceConfig {
  const config = buildPairedSyncConfig({
    apiSyncedSchema: input.apiSyncedSchema,
    encoding: "protobuf",
    limits: input.limits,
    localSyncedSchema: input.localSyncedSchema,
    outputDir: input.outputDir,
    packageName: input.packageName,
    tables: input.tables,
  });

  return {
    contract: config.contract,
    outputDir: input.outputDir,
    outputs: input.outputs,
  };
}

function validatePairedTableColumns(input: {
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

function getColumnNames(table: AnySQLiteTable): Set<string> {
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
