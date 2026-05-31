import { describe, expect, test } from "bun:test";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createTauriDrizzleDatabase, type InvokeFn } from "../drizzle-proxy";

const items = sqliteTable("items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  count: integer("count").notNull().default(0),
});

describe("createTauriDrizzleDatabase", () => {
  test("routes queries through custom invoke", async () => {
    const calls: Array<{ cmd: string; args: Record<string, unknown> }> = [];

    const mockInvoke: InvokeFn = (cmd, args) => {
      calls.push({ cmd, args: args ?? {} });
      if (cmd === "plugin:baresync|run_sql") {
        return Promise.resolve([]);
      }
      return Promise.resolve({ last_insert_id: 0, rows_affected: 0 });
    };

    const db = createTauriDrizzleDatabase({
      invoke: mockInvoke,
      schema: { items },
    });

    await db.select().from(items);

    expect(calls.length).toBe(1);
    expect(calls[0].cmd).toBe("plugin:baresync|run_sql");
    expect((calls[0].args.query as { sql: string }).sql).toContain("items");
  });

  test("routes batch through custom invoke and command mapping", async () => {
    const calls: Array<{ args: Record<string, unknown>; cmd: string }> = [];

    const mockInvoke: InvokeFn = (cmd, args) => {
      calls.push({ cmd, args: args ?? {} });
      if (cmd === "plugin:baresync|run_sql") {
        return Promise.resolve([]);
      }
      return Promise.resolve([{ rows: [] }, { rows: [] }]);
    };

    const db = createTauriDrizzleDatabase({
      invoke: mockInvoke,
      commands: { runSqlBatch: "custom_batch" },
      schema: { items },
    });

    await db.batch([
      db.insert(items).values({ id: "test-1", name: "test-item-1" }),
      db.insert(items).values({ id: "test-2", name: "test-item-2" }),
    ]);

    const batchCalls = calls.filter((c) => c.cmd === "custom_batch");
    expect(batchCalls.length).toBe(1);
    expect(batchCalls[0].args.statements).toEqual([
      {
        method: "run",
        params: ["test-1", "test-item-1", 0],
        sql: 'insert into "items" ("id", "name", "count") values (?, ?, ?)',
      },
      {
        method: "run",
        params: ["test-2", "test-item-2", 0],
        sql: 'insert into "items" ("id", "name", "count") values (?, ?, ?)',
      },
    ]);
  });

  test("uses plugin command defaults for batch queries", async () => {
    const calls: Array<{ cmd: string }> = [];

    const mockInvoke: InvokeFn = (cmd) => {
      calls.push({ cmd });
      if (cmd === "plugin:baresync|run_sql") {
        return Promise.resolve([]);
      }
      return Promise.resolve([{ rows: [] }]);
    };

    const db = createTauriDrizzleDatabase({
      invoke: mockInvoke,
      schema: { items },
    });

    await db.batch([
      db.insert(items).values({ id: "test-1", name: "test-item-1" }),
    ]);

    expect(calls).toContainEqual({ cmd: "plugin:baresync|run_sql_batch" });
  });

  test("uses custom command names", async () => {
    const calls: Array<{ cmd: string }> = [];

    const mockInvoke: InvokeFn = (cmd) => {
      calls.push({ cmd });
      return Promise.resolve([]);
    };

    const db = createTauriDrizzleDatabase({
      invoke: mockInvoke,
      commands: { runSql: "custom_run", runSqlBatch: "custom_batch" },
      schema: { items },
    });

    await db.select().from(items);

    expect(calls[0].cmd).toBe("custom_run");
  });

  test("reports query context without hiding original invoke error", async () => {
    const error = { code: "SQLITE_BUSY", message: "database is locked" };
    const contexts: Array<{
      method: string;
      params: unknown[];
      sql: string;
    }> = [];

    const db = createTauriDrizzleDatabase({
      invoke: () => Promise.reject(error),
      onQueryError: (_error, query) => {
        contexts.push(query);
      },
      schema: { items },
    });

    await expect(db.select().from(items).execute()).rejects.toMatchObject({
      cause: error,
    });
    expect(contexts).toEqual([
      {
        method: "all",
        params: [],
        sql: 'select "id", "name", "count" from "items"',
      },
    ]);
  });
});
