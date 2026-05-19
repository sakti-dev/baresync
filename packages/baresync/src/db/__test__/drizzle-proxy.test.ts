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

    const mockInvoke: InvokeFn = async (cmd, args) => {
      calls.push({ cmd, args: args ?? {} });
      if (cmd === "run_sql") {
        return [];
      }
      return { last_insert_id: 0, rows_affected: 0 };
    };

    const db = createTauriDrizzleDatabase({
      invoke: mockInvoke,
      schema: { items },
    });

    await db.select().from(items);

    expect(calls.length).toBe(1);
    expect(calls[0].cmd).toBe("run_sql");
    expect((calls[0].args.query as { sql: string }).sql).toContain("items");
  });

  test("routes batch through custom invoke", async () => {
    const calls: Array<{ cmd: string; args: Record<string, unknown> }> = [];

    const mockInvoke: InvokeFn = async (cmd, args) => {
      calls.push({ cmd, args: args ?? {} });
      if (cmd === "run_sql") {
        return [];
      }
      return { last_insert_id: 1, rows_affected: 1 };
    };

    const db = createTauriDrizzleDatabase({
      invoke: mockInvoke,
      commands: { runSqlBatch: "custom_batch" },
      schema: { items },
    });

    await db.insert(items).values({ id: "test", name: "test-item" });

    const batchCalls = calls.filter((c) => c.cmd === "custom_batch");
    expect(batchCalls.length).toBeGreaterThanOrEqual(0);
  });

  test("uses custom command names", async () => {
    const calls: Array<{ cmd: string }> = [];

    const mockInvoke: InvokeFn = async (cmd) => {
      calls.push({ cmd });
      return [];
    };

    const db = createTauriDrizzleDatabase({
      invoke: mockInvoke,
      commands: { runSql: "custom_run", runSqlBatch: "custom_batch" },
      schema: { items },
    });

    await db.select().from(items);

    expect(calls[0].cmd).toBe("custom_run");
  });
});
