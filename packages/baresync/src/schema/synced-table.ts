import {
  type AnySQLiteColumn,
  type AnySQLiteTable,
  getTableConfig,
  type SQLiteColumn,
} from "drizzle-orm/sqlite-core";

export interface ScopeMapping {
  column: AnySQLiteColumn;
  field: string;
  source: "scope";
}

export interface SyncedTableDefinition {
  conflict?: {
    strategy: string;
    column: AnySQLiteColumn;
  };
  delete?: {
    mode: "soft";
    column: AnySQLiteColumn;
  };
  localOnlyColumns?: string[];
  scope: ScopeMapping;
  serverOnlyColumns?: string[];
  table: AnySQLiteTable;
}

export function defineSyncedTable(input: {
  table: AnySQLiteTable;
  scope: ScopeMapping;
  localOnlyColumns?: string[];
  serverOnlyColumns?: string[];
  conflict?: { strategy: string; column: AnySQLiteColumn };
  delete?: { mode: "soft"; column: AnySQLiteColumn };
}): SyncedTableDefinition {
  return {
    table: input.table,
    scope: input.scope,
    localOnlyColumns: input.localOnlyColumns,
    serverOnlyColumns: input.serverOnlyColumns,
    conflict: input.conflict,
    delete: input.delete,
  };
}

export function syncedTable(
  table: AnySQLiteTable,
  options: {
    scope: string | ScopeMapping;
    localOnlyColumns?: string[];
    serverOnlyColumns?: string[];
  }
): SyncedTableDefinition {
  const scope: ScopeMapping =
    typeof options.scope === "string"
      ? resolveScopeFromTable(table, options.scope)
      : options.scope;

  return {
    table,
    scope,
    localOnlyColumns: options.localOnlyColumns,
    serverOnlyColumns: options.serverOnlyColumns,
  };
}

function resolveScopeFromTable(
  table: AnySQLiteTable,
  scopeName: string
): ScopeMapping {
  const config = getTableConfig(table);
  const column = config.columns.find(
    (c: SQLiteColumn) =>
      c.name === scopeName || snakeToCamel(c.name) === scopeName
  );
  if (!column) {
    throw new Error(
      `Scope column "${scopeName}" not found in table "${config.name}". ` +
        `Available columns: ${config.columns.map((c: SQLiteColumn) => c.name).join(", ")}`
    );
  }
  return { source: "scope", field: snakeToCamel(column.name), column };
}

function snakeToCamel(s: string): string {
  const result = s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  return result.slice(0, 1).toLowerCase() + result.slice(1);
}
