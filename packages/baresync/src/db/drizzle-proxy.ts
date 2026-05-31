import { drizzle } from "drizzle-orm/sqlite-proxy";

export type InvokeFn = (
  cmd: string,
  args?: Record<string, unknown>
) => Promise<unknown>;

export interface TauriDrizzleDatabaseConfig {
  commands?: {
    runSql?: string;
    runSqlBatch?: string;
  };
  invoke?: InvokeFn;
  onQueryError?: (
    error: unknown,
    query: { sql: string; params: unknown[]; method: string }
  ) => void;
  schema: Record<string, unknown>;
}

interface PluginSqlRow {
  columns: string[];
  values: unknown[];
}

function resolveInvoke(custom?: InvokeFn): InvokeFn {
  if (custom) {
    return custom;
  }
  throw new Error("createTauriDrizzleDatabase requires an invoke function");
}

function isPluginSqlRow(value: unknown): value is PluginSqlRow {
  return (
    typeof value === "object" &&
    value !== null &&
    "columns" in value &&
    "values" in value &&
    Array.isArray((value as PluginSqlRow).columns) &&
    Array.isArray((value as PluginSqlRow).values)
  );
}

function normalizeRows(result: unknown): unknown[][] {
  if (!Array.isArray(result)) {
    return [];
  }

  return result.map((row) => {
    if (!isPluginSqlRow(row)) {
      return Array.isArray(row) ? row : [row];
    }

    return row.values;
  });
}

export function createTauriDrizzleDatabase(config: TauriDrizzleDatabaseConfig) {
  const runSqlCmd = config.commands?.runSql ?? "plugin:baresync|run_sql";
  const runSqlBatchCmd =
    config.commands?.runSqlBatch ?? "plugin:baresync|run_sql_batch";

  return drizzle(
    async (sql: string, params: unknown[], method: string) => {
      try {
        const invoke = resolveInvoke(config.invoke);
        const result = await invoke(runSqlCmd, {
          query: { sql, params, method },
        });
        return { rows: normalizeRows(result) };
      } catch (error) {
        config.onQueryError?.(error, { sql, params, method });
        throw error;
      }
    },
    async (statements: { sql: string; params: unknown[] }[]) => {
      const invoke = resolveInvoke(config.invoke);
      const result = await invoke(runSqlBatchCmd, { statements });
      return result as { rows: Record<string, unknown>[] }[];
    },
    config.schema
  );
}
