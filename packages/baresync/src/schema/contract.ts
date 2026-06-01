import { getTableConfig, type SQLiteColumn } from "drizzle-orm/sqlite-core";
import type { SyncedTableDefinition } from "./synced-table";

export interface SyncContractLimits {
  maxPushBytes: number;
  maxPushRows: number;
}

export interface SyncContractTableMeta {
  columns: string[];
  localOnlyColumns: string[];
  scope: { field: string };
  serverOnlyColumns: string[];
  tableName: string;
}

export interface SyncContract {
  limits: SyncContractLimits;
  tables: SyncedTableDefinition[];
  tablesMeta: SyncContractTableMeta[];
}

const DEFAULT_LIMITS: SyncContractLimits = {
  maxPushBytes: 2 * 1024 * 1024,
  maxPushRows: 2000,
};

export function defineSyncContract(input: {
  tables: SyncedTableDefinition[];
  limits?: Partial<SyncContractLimits>;
}): SyncContract {
  const limits: SyncContractLimits = { ...DEFAULT_LIMITS, ...input.limits };
  const tablesMeta = input.tables.map((t) => validateAndExtractTableMeta(t));

  return {
    tables: input.tables,
    limits,
    tablesMeta,
  };
}

export function syncSchema(input: {
  tables: SyncedTableDefinition[];
  limits?: Partial<SyncContractLimits>;
}): SyncContract {
  return defineSyncContract({
    tables: input.tables,
    limits: input.limits,
  });
}

function validateAndExtractTableMeta(
  def: SyncedTableDefinition
): SyncContractTableMeta {
  const config = getTableConfig(def.table);
  const tableName = config.name;
  const columns = config.columns as SQLiteColumn[];
  const columnNames = columns.map((c) => c.name);

  const pkColumns = config.primaryKeys.flatMap((pk) => pk.columns);
  if (pkColumns.length === 0) {
    const idCol = columns.find((c) => c.name === "id");
    if (!idCol) {
      throw new Error(
        `Table "${tableName}" is missing a primary key column "id".`
      );
    }
  }

  const scopeCol = columns.find(
    (c) =>
      c.name === def.scope.field || camelToSnake(def.scope.field) === c.name
  );
  if (!scopeCol) {
    throw new Error(
      `Table "${tableName}" scope field "${def.scope.field}" does not map to a real column. ` +
        `Available: ${columnNames.join(", ")}`
    );
  }

  if (!columnNames.includes("deleted_at")) {
    throw new Error(
      `Table "${tableName}" is missing "deleted_at" column required for soft-delete sync.`
    );
  }

  return {
    tableName,
    columns: columnNames,
    scope: { field: def.scope.field },
    localOnlyColumns: def.localOnlyColumns ?? [],
    serverOnlyColumns: def.serverOnlyColumns ?? [],
  };
}

function camelToSnake(s: string): string {
  const result = s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  return result.startsWith("_") ? result.slice(1) : result;
}
