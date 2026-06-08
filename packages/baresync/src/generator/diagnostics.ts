import {
  type AnySQLiteTable,
  getTableConfig,
  type SQLiteColumn,
} from "drizzle-orm/sqlite-core";
import type { SyncContract } from "../schema/contract";
import type { SyncedTableDefinition } from "../schema/synced-table";
import { computeSyncTableOrder } from "./fk-order";

const CYCLE_RE = /cycle/i;
const CYCLE_TABLE_RE = /at (\w+)/;
const EXTERNAL_RE = /external/i;
const EXTERNAL_TABLE_RE = /from (\w+) to (?:external )?table? ?(\w+)/i;

export interface SyncDiagnostic {
  code: string;
  column?: string;
  docs?: string;
  fix: string;
  message: string;
  severity: "error" | "warning" | "info";
  table?: string;
  why: string;
}

interface PairedDiagnosticTable {
  apiTable: AnySQLiteTable;
  localTable: AnySQLiteTable;
}

const KNOWN_COLUMN_TYPES = new Set([
  "SQLiteText",
  "SQLiteInteger",
  "SQLiteBoolean",
  "SQLiteTimestamp",
  "SQLiteReal",
  "SQLiteBlobBuffer",
  "SQLiteBlobJson",
  "SQLiteTextJson",
]);

const RESERVED_FIELDS = new Set([
  "id",
  "created_at",
  "updated_at",
  "deleted_at",
  "is_synced",
  "sync_updated_at",
]);

function camelToSnake(s: string): string {
  const result = s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  return result.startsWith("_") ? result.slice(1) : result;
}

function snakeToCamel(s: string): string {
  const result = s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  return result.slice(0, 1).toLowerCase() + result.slice(1);
}

function checkMissingPrimaryKey(
  def: SyncedTableDefinition,
  tableName: string
): SyncDiagnostic[] {
  const config = getTableConfig(def.table);
  const pkFromColumns = config.columns.filter((c: SQLiteColumn) => c.primary);
  const pkFromComposite = config.primaryKeys.flatMap((pk) => pk.columns);
  if (pkFromColumns.length === 0 && pkFromComposite.length === 0) {
    return [
      {
        code: "SYNC_SCHEMA_MISSING_PRIMARY_KEY",
        severity: "error",
        message: `Table "${tableName}" has no primary key`,
        table: tableName,
        why: "Every synced table must have a primary key for conflict detection and delta tracking",
        fix: 'Add a primary key column (typically text "id") to the table definition',
      },
    ];
  }
  return [];
}

function checkUnsupportedPrimaryKey(
  def: SyncedTableDefinition,
  tableName: string
): SyncDiagnostic[] {
  const config = getTableConfig(def.table);
  const pkFromColumns = config.columns.filter((c: SQLiteColumn) => c.primary);
  const pkFromComposite = config.primaryKeys.flatMap((pk) => pk.columns);

  if (pkFromComposite.length > 1) {
    return [
      {
        code: "SYNC_SCHEMA_UNSUPPORTED_PRIMARY_KEY",
        severity: "error",
        message: `Table "${tableName}" has a composite primary key`,
        table: tableName,
        why: 'Baresync requires a single text "id" column as primary key',
        fix: 'Replace the composite primary key with a single text "id" column',
      },
    ];
  }

  if (pkFromColumns.length === 1) {
    const pk = pkFromColumns[0] as SQLiteColumn;
    if (pk.columnType !== "SQLiteText" || pk.name !== "id") {
      return [
        {
          code: "SYNC_SCHEMA_UNSUPPORTED_PRIMARY_KEY",
          severity: "error",
          message: `Table "${tableName}" primary key is "${pk.name}" (${pk.columnType}), expected text "id"`,
          table: tableName,
          column: pk.name,
          why: 'Baresync requires a single text "id" column as primary key',
          fix: 'Change the primary key to a text column named "id"',
        },
      ];
    }
  }

  if (pkFromComposite.length === 1) {
    const pkCol = pkFromComposite[0] as SQLiteColumn;
    if (pkCol.columnType !== "SQLiteText" || pkCol.name !== "id") {
      return [
        {
          code: "SYNC_SCHEMA_UNSUPPORTED_PRIMARY_KEY",
          severity: "error",
          message: `Table "${tableName}" primary key is "${pkCol.name}" (${pkCol.columnType}), expected text "id"`,
          table: tableName,
          column: pkCol.name,
          why: 'Baresync requires a single text "id" column as primary key',
          fix: 'Change the primary key to a text column named "id"',
        },
      ];
    }
  }

  return [];
}

function checkMissingScopeColumn(
  def: SyncedTableDefinition,
  tableName: string,
  columns: string[]
): SyncDiagnostic[] {
  const scopeField = def.scope.field;
  const snakeField = camelToSnake(scopeField);
  const camelField = snakeToCamel(scopeField);
  const hasField = columns.some(
    (c) => c === scopeField || c === snakeField || c === camelField
  );
  if (!hasField) {
    return [
      {
        code: "SYNC_SCHEMA_MISSING_SCOPE_COLUMN",
        severity: "error",
        message: `Table "${tableName}" scope field "${scopeField}" not found in columns`,
        table: tableName,
        column: scopeField,
        why: "The scope field must map to an actual column in the table for filtering sync data",
        fix: `Add a column named "${snakeField}" or "${scopeField}" to the table, or correct the scope field name`,
      },
    ];
  }
  return [];
}

function checkMissingDeletedAt(
  tableName: string,
  columns: string[]
): SyncDiagnostic[] {
  if (!columns.includes("deleted_at")) {
    return [
      {
        code: "SYNC_SCHEMA_MISSING_DELETED_AT",
        severity: "error",
        message: `Table "${tableName}" is missing "deleted_at" column`,
        table: tableName,
        column: "deleted_at",
        why: 'Soft-delete sync requires a "deleted_at" column to track tombstones',
        fix: 'Add a text "deleted_at" column to the table',
      },
    ];
  }
  return [];
}

function checkMissingRowStateColumns(
  _def: SyncedTableDefinition,
  tableName: string,
  columns: string[]
): SyncDiagnostic[] {
  const diagnostics: SyncDiagnostic[] = [];
  const hasCreatedAt = columns.includes("created_at");
  const hasUpdatedAt = columns.includes("updated_at");
  if (!hasCreatedAt) {
    diagnostics.push({
      code: "SYNC_SCHEMA_MISSING_ROW_STATE_COLUMN",
      severity: "error",
      message: `Table "${tableName}" is missing "created_at" column`,
      table: tableName,
      column: "created_at",
      why: 'Row state tracking requires "created_at" for temporal ordering',
      fix: 'Add a text "created_at" column to the table',
    });
  }
  if (!hasUpdatedAt) {
    diagnostics.push({
      code: "SYNC_SCHEMA_MISSING_ROW_STATE_COLUMN",
      severity: "error",
      message: `Table "${tableName}" is missing "updated_at" column`,
      table: tableName,
      column: "updated_at",
      why: 'Row state tracking requires "updated_at" for conflict detection',
      fix: 'Add a text "updated_at" column to the table',
    });
  }
  return diagnostics;
}

function checkMissingSyncUpdatedAt(
  def: SyncedTableDefinition,
  tableName: string,
  columns: string[]
): SyncDiagnostic[] {
  const serverOnly = def.serverOnlyColumns ?? [];
  if (
    !(
      columns.includes("sync_updated_at") ||
      serverOnly.includes("sync_updated_at") ||
      serverOnly.includes("syncUpdatedAt")
    )
  ) {
    return [
      {
        code: "SYNC_SCHEMA_MISSING_SYNC_UPDATED_AT",
        severity: "warning",
        message: `Table "${tableName}" is missing "sync_updated_at" column (server-side row state)`,
        table: tableName,
        column: "sync_updated_at",
        why: 'Server-side sync tracking requires "sync_updated_at" for watermark-based incremental sync',
        fix: 'Add an integer "sync_updated_at" column to the table using apiSyncColumns()',
      },
    ];
  }
  return [];
}

function checkMissingLocalIsSynced(
  def: SyncedTableDefinition,
  tableName: string,
  columns: string[]
): SyncDiagnostic[] {
  const localOnly = def.localOnlyColumns ?? [];
  if (
    !(
      columns.includes("is_synced") ||
      localOnly.includes("is_synced") ||
      localOnly.includes("isSynced")
    )
  ) {
    return [
      {
        code: "SYNC_SCHEMA_MISSING_LOCAL_IS_SYNCED",
        severity: "error",
        message: `Table "${tableName}" is missing "is_synced" column (client-side row state)`,
        table: tableName,
        column: "is_synced",
        why: 'Client-side dirty tracking requires "is_synced" to identify pending changes',
        fix: 'Add an integer "is_synced" column to the table using localSyncColumns()',
      },
    ];
  }
  return [];
}

function checkDuplicateTableName(
  tablesMeta: Array<{ tableName: string }>
): SyncDiagnostic[] {
  const seen = new Map<string, number>();
  const diagnostics: SyncDiagnostic[] = [];
  for (const meta of tablesMeta) {
    const count = seen.get(meta.tableName) ?? 0;
    seen.set(meta.tableName, count + 1);
  }
  for (const [name, count] of seen) {
    if (count > 1) {
      diagnostics.push({
        code: "SYNC_SCHEMA_DUPLICATE_TABLE_NAME",
        severity: "error",
        message: `Table name "${name}" appears ${count} times in the contract`,
        table: name,
        why: "Duplicate table names cause ambiguous sync targets",
        fix: "Ensure each synced table has a unique name",
      });
    }
  }
  return diagnostics;
}

function checkUnsupportedColumnType(
  def: SyncedTableDefinition,
  tableName: string
): SyncDiagnostic[] {
  const config = getTableConfig(def.table);
  const diagnostics: SyncDiagnostic[] = [];
  for (const col of config.columns as SQLiteColumn[]) {
    if (!KNOWN_COLUMN_TYPES.has(col.columnType)) {
      diagnostics.push({
        code: "SYNC_SCHEMA_UNSUPPORTED_COLUMN_TYPE",
        severity: "error",
        message: `Column "${col.name}" in table "${tableName}" has unsupported type "${col.columnType}"`,
        table: tableName,
        column: col.name,
        why: `Baresync does not know how to serialize/deserialize "${col.columnType}" columns`,
        fix: `Change column "${col.name}" to a supported type (text, integer, real, blob)`,
      });
    }
  }
  return diagnostics;
}

function checkDuplicateFieldName(
  _def: SyncedTableDefinition,
  tableName: string,
  columns: string[]
): SyncDiagnostic[] {
  const seen = new Map<string, number>();
  const diagnostics: SyncDiagnostic[] = [];
  for (const col of columns) {
    const count = seen.get(col) ?? 0;
    seen.set(col, count + 1);
  }
  for (const [name, count] of seen) {
    if (count > 1) {
      diagnostics.push({
        code: "SYNC_SCHEMA_DUPLICATE_FIELD_NAME",
        severity: "error",
        message: `Column name "${name}" appears ${count} times in table "${tableName}"`,
        table: tableName,
        column: name,
        why: "Duplicate column names cause ambiguous field mapping",
        fix: "Ensure each column in the table has a unique name",
      });
    }
  }
  return diagnostics;
}

function checkReservedFieldReused(
  def: SyncedTableDefinition,
  tableName: string
): SyncDiagnostic[] {
  const config = getTableConfig(def.table);
  const diagnostics: SyncDiagnostic[] = [];
  for (const col of config.columns as SQLiteColumn[]) {
    if (RESERVED_FIELDS.has(col.name)) {
      let expectedTypes: string[];
      if (col.name === "id") {
        expectedTypes = ["SQLiteText"];
      } else if (col.name === "is_synced") {
        expectedTypes = ["SQLiteInteger", "SQLiteBoolean"];
      } else if (col.name === "sync_updated_at") {
        expectedTypes = ["SQLiteInteger", "SQLiteTimestamp"];
      } else {
        expectedTypes = ["SQLiteText"];
      }
      if (!expectedTypes.includes(col.columnType)) {
        diagnostics.push({
          code: "SYNC_SCHEMA_RESERVED_FIELD_REUSED",
          severity: "error",
          message: `Reserved column "${col.name}" in table "${tableName}" has type "${col.columnType}" but expected one of ${expectedTypes.join(", ")}`,
          table: tableName,
          column: col.name,
          why: "Reserved sync columns must have the expected type for correct protocol behavior",
          fix: `Change column "${col.name}" to an expected type (${expectedTypes.join(", ")})`,
        });
      }
    }
  }
  return diagnostics;
}

function checkFkCycleAndExternalFk(contract: SyncContract): SyncDiagnostic[] {
  const diagnostics: SyncDiagnostic[] = [];
  const schemaModule: Record<string, unknown> = {};
  for (const t of contract.tables) {
    const config = getTableConfig(t.table);
    schemaModule[config.name] = t.table;
  }
  const syncedTableNames = contract.tablesMeta.map((t) => t.tableName);

  try {
    computeSyncTableOrder({ schemaModule, syncedTableNames });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (CYCLE_RE.test(message)) {
      const match = message.match(CYCLE_TABLE_RE);
      diagnostics.push({
        code: "SYNC_SCHEMA_FK_CYCLE",
        severity: "error",
        message: "Foreign key cycle detected in sync tables",
        table: match?.[1],
        why: "Cyclic foreign keys prevent deterministic sync ordering",
        fix: "Break the cycle by making one FK nullable or removing it",
      });
    } else if (EXTERNAL_RE.test(message)) {
      const match = message.match(EXTERNAL_TABLE_RE);
      diagnostics.push({
        code: "SYNC_SCHEMA_REQUIRED_EXTERNAL_FK",
        severity: "error",
        message,
        table: match?.[1],
        why: "Required foreign keys to non-synced tables cannot be resolved during sync",
        fix: "Either add the referenced table to the sync contract or make the FK nullable",
      });
    }
  }

  return diagnostics;
}

export interface DiagnosticOptions {
  pairedTables?: readonly PairedDiagnosticTable[];
  previousTables?: string[];
}

function checkNullableScopeColumn(
  def: SyncedTableDefinition,
  tableName: string
): SyncDiagnostic[] {
  const config = getTableConfig(def.table);
  const scopeField = def.scope.field;
  const snakeField = camelToSnake(scopeField);
  const col = (config.columns as SQLiteColumn[]).find(
    (c) => c.name === scopeField || c.name === snakeField
  );
  if (col && !col.notNull) {
    return [
      {
        code: "SYNC_SCHEMA_NULLABLE_SCOPE_COLUMN",
        severity: "warning",
        message: `Scope column "${col.name}" in table "${tableName}" is nullable`,
        table: tableName,
        column: col.name,
        why: "Nullable scope columns may cause rows to be missed during scoped sync",
        fix: `Make column "${col.name}" NOT NULL for reliable sync scoping`,
      },
    ];
  }
  return [];
}

function checkBatteriesIncludedNot1To1(
  meta: {
    localOnlyColumns?: string[];
    serverOnlyColumns?: string[];
  },
  tableName: string
): SyncDiagnostic[] {
  const localOnly = (meta.localOnlyColumns ?? []).filter(
    (column) => camelToSnake(column) !== "is_synced"
  );
  const serverOnly = (meta.serverOnlyColumns ?? []).filter(
    (column) => camelToSnake(column) !== "sync_updated_at"
  );

  if (localOnly.length > 0 && serverOnly.length > 0) {
    return [
      {
        code: "SYNC_SCHEMA_BATTERIES_INCLUDED_NOT_1_TO_1",
        severity: "warning",
        message: `Table "${tableName}" mixes local-only and server-only columns`,
        table: tableName,
        why: "Batteries-included contracts are easiest to maintain when local and server columns map 1:1 with the sync schema",
        fix: "Split local-only or server-only state into explicit sync columns when possible",
      },
    ];
  }

  return [];
}

function isSQLiteColumn(value: unknown): value is SQLiteColumn {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof (value as { name?: unknown }).name === "string"
  );
}

function getIndexColumnNames(index: {
  config: {
    columns: unknown[];
  };
}): string[] | null {
  const names: string[] = [];

  for (const column of index.config.columns) {
    if (!isSQLiteColumn(column)) {
      return null;
    }
    names.push(column.name);
  }

  return names;
}

function indexHasOrderedPrefix(
  index: {
    config: {
      columns: unknown[];
    };
  },
  expectedPrefix: string[]
): boolean {
  const columns = getIndexColumnNames(index);
  if (!columns || columns.length < expectedPrefix.length) {
    return false;
  }

  for (let i = 0; i < expectedPrefix.length; i++) {
    if (columns[i] !== expectedPrefix[i]) {
      return false;
    }
  }

  return true;
}

function findPhysicalColumnName(
  table: AnySQLiteTable,
  fieldName: string
): string | undefined {
  const config = getTableConfig(table);
  const snakeField = camelToSnake(fieldName);
  const camelField = snakeToCamel(fieldName);

  return (config.columns as SQLiteColumn[]).find(
    (column) =>
      column.name === fieldName ||
      column.name === snakeField ||
      column.name === camelField
  )?.name;
}

function checkLargeTextField(
  def: SyncedTableDefinition,
  tableName: string
): SyncDiagnostic[] {
  const config = getTableConfig(def.table);
  const diagnostics: SyncDiagnostic[] = [];
  for (const col of config.columns as SQLiteColumn[]) {
    if (col.columnType === "SQLiteText") {
      const lengthConfig = (col as unknown as { length?: number }).length;
      if (typeof lengthConfig === "number" && lengthConfig > 10_000) {
        diagnostics.push({
          code: "SYNC_SCHEMA_LARGE_TEXT_FIELD",
          severity: "warning",
          message: `Text column "${col.name}" in table "${tableName}" has length ${lengthConfig} which exceeds 10000`,
          table: tableName,
          column: col.name,
          why: "Large text fields increase sync payload size and may cause performance issues",
          fix: "Consider reducing the column length or excluding this column from sync",
        });
      }
    }
  }
  return diagnostics;
}

function checkJsonOnlyField(
  def: SyncedTableDefinition,
  tableName: string
): SyncDiagnostic[] {
  const config = getTableConfig(def.table);
  const diagnostics: SyncDiagnostic[] = [];
  for (const col of config.columns as SQLiteColumn[]) {
    if (
      col.columnType === "SQLiteBlobJson" ||
      col.columnType === "SQLiteTextJson"
    ) {
      diagnostics.push({
        code: "SYNC_SCHEMA_JSON_ONLY_FIELD",
        severity: "warning",
        message: `Column "${col.name}" in table "${tableName}" uses JSON type (${col.columnType})`,
        table: tableName,
        column: col.name,
        why: "JSON-typed columns require special handling during serialization",
        fix: "Consider storing JSON as a plain text column and parsing application-side",
      });
    }
  }
  return diagnostics;
}

function checkMissingScopeWatermark(
  def: SyncedTableDefinition,
  tableName: string,
  table: AnySQLiteTable
): SyncDiagnostic[] {
  const config = getTableConfig(table);
  const hasSyncUpdatedAt = (config.columns as SQLiteColumn[]).some(
    (column) => column.name === "sync_updated_at"
  );

  if (!hasSyncUpdatedAt) {
    return [];
  }

  const scopeColumn = findPhysicalColumnName(table, def.scope.field);
  if (!scopeColumn) {
    return [];
  }

  const hasScopeWatermarkIndex = config.indexes.some((index) =>
    indexHasOrderedPrefix(index, [scopeColumn, "sync_updated_at"])
  );

  if (hasScopeWatermarkIndex) {
    return [];
  }

  return [
    {
      code: "SYNC_INDEX_MISSING_SCOPE_WATERMARK",
      severity: "warning",
      message: `Table "${tableName}" may be missing a composite index on (scope, sync watermark)`,
      table: tableName,
      why: "Without a scope+watermark index, incremental sync queries may be slow on large tables",
      fix: "Create a composite index on (scope_column, sync_updated_at) for efficient watermark queries",
    },
  ];
}

function checkBatteriesIncludedComplexMapping(
  def: SyncedTableDefinition,
  tableName: string
): SyncDiagnostic[] {
  const scope = def.scope;
  if (
    scope.source !== "scope" ||
    scope.field !== snakeToCamel(camelToSnake(scope.field))
  ) {
    return [
      {
        code: "SYNC_SCHEMA_BATTERIES_INCLUDED_COMPLEX_MAPPING",
        severity: "warning",
        message: `Table "${tableName}" has a non-trivial scope mapping`,
        table: tableName,
        why: "Non-trivial scope mappings may not be handled correctly by batteries-included tooling",
        fix: "Use a simple scope mapping with a direct column reference",
      },
    ];
  }
  return [];
}

function checkAdditiveChange(
  contract: SyncContract,
  previousTables?: string[]
): SyncDiagnostic[] {
  if (!previousTables || previousTables.length === 0) {
    return [];
  }

  const currentTableNames = new Set(
    contract.tablesMeta.map((t) => t.tableName)
  );
  const diagnostics: SyncDiagnostic[] = [];

  for (const prev of previousTables) {
    if (!currentTableNames.has(prev)) {
      diagnostics.push({
        code: "SYNC_COMPAT_ADDITIVE_CHANGE",
        severity: "warning",
        message: `Table "${prev}" was in the previous manifest but is missing from the current contract`,
        table: prev,
        why: "Removing tables from a sync contract may cause data loss on clients that still have local data for this table",
        fix: "Keep the table in the contract and handle migration separately, or document the removal",
      });
    }
  }

  return diagnostics;
}

export function runDiagnostics(
  contract: SyncContract,
  options?: DiagnosticOptions
): SyncDiagnostic[] {
  const diagnostics: SyncDiagnostic[] = [];
  const pairedTablesByName = new Map<string, AnySQLiteTable>();

  for (const pair of options?.pairedTables ?? []) {
    const localTableName = getTableConfig(pair.localTable).name;
    pairedTablesByName.set(localTableName, pair.apiTable);
  }

  diagnostics.push(...checkDuplicateTableName(contract.tablesMeta));
  diagnostics.push(...checkFkCycleAndExternalFk(contract));
  diagnostics.push(...checkAdditiveChange(contract, options?.previousTables));

  for (let i = 0; i < contract.tables.length; i++) {
    const def = contract.tables[i];
    const meta = contract.tablesMeta[i];
    const tableName = meta.tableName;
    const columns = meta.columns;

    diagnostics.push(...checkMissingPrimaryKey(def, tableName));
    diagnostics.push(...checkUnsupportedPrimaryKey(def, tableName));
    diagnostics.push(...checkMissingScopeColumn(def, tableName, columns));
    diagnostics.push(...checkMissingDeletedAt(tableName, columns));
    diagnostics.push(...checkMissingRowStateColumns(def, tableName, columns));
    diagnostics.push(...checkMissingSyncUpdatedAt(def, tableName, columns));
    diagnostics.push(...checkMissingLocalIsSynced(def, tableName, columns));
    diagnostics.push(...checkUnsupportedColumnType(def, tableName));
    diagnostics.push(...checkDuplicateFieldName(def, tableName, columns));
    diagnostics.push(...checkReservedFieldReused(def, tableName));

    diagnostics.push(...checkNullableScopeColumn(def, tableName));
    diagnostics.push(...checkBatteriesIncludedNot1To1(meta, tableName));
    diagnostics.push(...checkLargeTextField(def, tableName));
    diagnostics.push(...checkJsonOnlyField(def, tableName));
    diagnostics.push(
      ...checkMissingScopeWatermark(
        def,
        tableName,
        pairedTablesByName.get(tableName) ?? def.table
      )
    );
    diagnostics.push(...checkBatteriesIncludedComplexMapping(def, tableName));
  }

  return diagnostics;
}
