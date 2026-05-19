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

function resolveInvoke(custom?: InvokeFn): InvokeFn {
  if (custom) {
    return custom;
  }
  throw new Error("createTauriDrizzleDatabase requires an invoke function");
}

export function createTauriDrizzleDatabase(config: TauriDrizzleDatabaseConfig) {
  const runSqlCmd = config.commands?.runSql ?? "run_sql";
  const runSqlBatchCmd = config.commands?.runSqlBatch ?? "run_sql_batch";

  return drizzle(
    async (sql: string, params: unknown[], method: string) => {
      try {
        const invoke = resolveInvoke(config.invoke);
        const result = await invoke(runSqlCmd, {
          query: { sql, params, method },
        });
        return { rows: result as Record<string, unknown>[] };
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
