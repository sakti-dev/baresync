import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { defineSyncContract } from "../schema/contract";
import { defineSyncedTable } from "../schema/synced-table";

const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

const categoriesSynced = defineSyncedTable({
  table: categories,
  scope: {
    source: "scope",
    field: "merchantId",
    column: categories.merchantId,
  },
  localOnlyColumns: ["isSynced"],
});

describe("CLI runGenerate", () => {
  it("produces artifacts from a contract config module", async () => {
    const outputDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "baresync-cli-test-")
    );

    const contract = defineSyncContract({
      encoding: "json",
      packageName: "cli.test.sync.v1",
      tables: [categoriesSynced],
    });

    const { runGenerate } = await import("../cli");
    await runGenerate(contract, outputDir);

    expect(fs.existsSync(path.join(outputDir, "sync-contract.json"))).toBe(
      true
    );
    expect(fs.existsSync(path.join(outputDir, "sync-table-order.ts"))).toBe(
      true
    );

    const parsed = JSON.parse(
      fs.readFileSync(path.join(outputDir, "sync-contract.json"), "utf-8")
    );
    expect(parsed.packageName).toBe("cli.test.sync.v1");

    fs.rmSync(outputDir, { recursive: true, force: true });
  });
});
