import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import type { GeneratorConfig } from "../generator";
import { runDiagnostics } from "../generator/diagnostics";
import type { SyncContract } from "../schema/contract";
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

  it("includes protobuf metadata for protobuf contracts", async () => {
    const outputDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "baresync-cli-test-")
    );

    const contract = defineSyncContract({
      encoding: "protobuf",
      packageName: "cli.test.sync.v1",
      tables: [categoriesSynced],
    });

    const { runGenerate } = await import("../cli");
    await runGenerate(contract, outputDir);

    const parsed = JSON.parse(
      fs.readFileSync(path.join(outputDir, "sync-contract.json"), "utf-8")
    );
    expect(parsed.encoding).toBe("protobuf");
    expect(parsed.protobuf.tables.categories.rowMessageName).toBe(
      "CategoriesRow"
    );
    expect(parsed.protobuf.tables.categories.requestFieldNumber).toBe(4);

    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  it("produces artifacts from a generator config object", async () => {
    const outputDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "baresync-cli-config-test-")
    );

    const contract = defineSyncContract({
      encoding: "json",
      packageName: "cli.config.sync.v1",
      tables: [categoriesSynced],
    });
    const config = {
      contract,
      outputDir,
    } satisfies GeneratorConfig;

    const { runGenerate } = await import("../cli");
    await runGenerate(config);

    const parsed = JSON.parse(
      fs.readFileSync(path.join(outputDir, "sync-contract.json"), "utf-8")
    );
    expect(parsed.packageName).toBe("cli.config.sync.v1");

    fs.rmSync(outputDir, { recursive: true, force: true });
  });
});

describe("doctor output format", () => {
  it("produces diagnostics with required fields for errors", () => {
    const table = sqliteTable("no_col", {
      id: text("id").primaryKey(),
      scope: text("scope").notNull(),
      deletedAt: text("deleted_at"),
      createdAt: text("created_at").notNull(),
      updatedAt: text("updated_at").notNull(),
    });
    const { getTableConfig: gtc } =
      require("drizzle-orm/sqlite-core") as typeof import("drizzle-orm/sqlite-core");
    const config = gtc(table);
    const contract: SyncContract = {
      encoding: "json",
      packageName: "test",
      tables: [
        {
          table,
          scope: { source: "scope", field: "scope", column: table.scope },
        },
      ],
      tablesMeta: [
        {
          tableName: config.name,
          columns: config.columns.map((c) => c.name),
          scope: { field: "scope" },
          localOnlyColumns: [],
          serverOnlyColumns: [],
        },
      ],
      limits: { maxPushBytes: 2_097_152, maxPushRows: 2000 },
    };
    const diagnostics = runDiagnostics(contract);
    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors.length).toBeGreaterThan(0);
    for (const e of errors) {
      expect(e.code).toBeTruthy();
      expect(e.why).toBeTruthy();
      expect(e.fix).toBeTruthy();
    }
  });
});
