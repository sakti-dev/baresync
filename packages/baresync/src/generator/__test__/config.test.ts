import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { defineSyncConfig } from "../config";
import { generateSyncArtifacts } from "../index";

function createTmpSchemaFile(
  dir: string,
  name: string,
  content: string
): string {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe("defineSyncConfig", () => {
  it("builds a generator config from schema file paths", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-config-"));
    const apiPath = createTmpSchemaFile(
      tmpDir,
      "api-synced-schema.ts",
      "export const test = {};"
    );
    const localPath = createTmpSchemaFile(
      tmpDir,
      "local-synced-schema.ts",
      "export const test = {};"
    );

    const config = defineSyncConfig({
      apiSyncedSchema: apiPath,
      localSyncedSchema: localPath,
      outputDir: "./generated",
      tables: {
        categories: { scopeColumn: "scope_id" },
        products: { scopeColumn: "scope_id" },
      },
    });

    expect(config.outputDir).toBe("./generated");
    expect(config.apiSyncedSchemaPath).toBe(apiPath);
    expect(config.localSyncedSchemaPath).toBe(localPath);
    expect(config.tables).toEqual({
      categories: { scopeColumn: "scope_id" },
      products: { scopeColumn: "scope_id" },
    });

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("stores limits when provided", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-config-"));
    const apiPath = createTmpSchemaFile(
      tmpDir,
      "api-synced-schema.ts",
      "// api"
    );
    const localPath = createTmpSchemaFile(
      tmpDir,
      "local-synced-schema.ts",
      "// local"
    );

    const config = defineSyncConfig({
      apiSyncedSchema: apiPath,
      localSyncedSchema: localPath,
      outputDir: "./generated",
      limits: { maxPushBytes: 1024, maxPushRows: 100 },
      tables: {
        items: { scopeColumn: "scope_id" },
      },
    });

    expect(config.limits).toEqual({ maxPushBytes: 1024, maxPushRows: 100 });

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("fails when API schema file does not exist", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-config-"));
    const localPath = createTmpSchemaFile(
      tmpDir,
      "local-synced-schema.ts",
      "// local"
    );

    expect(() =>
      defineSyncConfig({
        apiSyncedSchema: "./nonexistent/api-synced-schema.ts",
        localSyncedSchema: localPath,
        outputDir: "./generated",
        tables: {
          categories: { scopeColumn: "scope_id" },
        },
      })
    ).toThrow("API synced schema file not found");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("fails when local schema file does not exist", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-config-"));
    const apiPath = createTmpSchemaFile(
      tmpDir,
      "api-synced-schema.ts",
      "// api"
    );

    expect(() =>
      defineSyncConfig({
        apiSyncedSchema: apiPath,
        localSyncedSchema: "./nonexistent/local-synced-schema.ts",
        outputDir: "./generated",
        tables: {
          categories: { scopeColumn: "scope_id" },
        },
      })
    ).toThrow("Local synced schema file not found");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("does not contain packageName or encoding fields", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-config-"));
    const apiPath = createTmpSchemaFile(
      tmpDir,
      "api-synced-schema.ts",
      "// api"
    );
    const localPath = createTmpSchemaFile(
      tmpDir,
      "local-synced-schema.ts",
      "// local"
    );

    const config = defineSyncConfig({
      apiSyncedSchema: apiPath,
      localSyncedSchema: localPath,
      outputDir: "./generated",
      tables: {
        categories: { scopeColumn: "scope_id" },
      },
    });

    expect(config).not.toHaveProperty("packageName");
    expect(config).not.toHaveProperty("encoding");
    expect(config).not.toHaveProperty("schemaSourceDir");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads Drizzle tables from imported schema modules", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-config-"));
    const require = createRequire(import.meta.url);
    const sqliteCorePath = require.resolve("drizzle-orm/sqlite-core");
    const schemaIndexPath = require.resolve("baresync/schema");
    const counterPath = createTmpSchemaFile(
      tmpDir,
      "load-counter.ts",
      [
        "export const schemaLoadCounts = { api: 0, local: 0 };",
        "",
        'export function incrementSchemaLoad(key: "api" | "local") {',
        "  schemaLoadCounts[key] += 1;",
        "}",
        "",
      ].join("\n")
    );
    const apiPath = createTmpSchemaFile(
      tmpDir,
      "api-synced-schema.ts",
      [
        `import { sqliteTable, text } from ${JSON.stringify(sqliteCorePath)};`,
        `import { apiSyncColumns } from ${JSON.stringify(schemaIndexPath)};`,
        `import { incrementSchemaLoad } from ${JSON.stringify(
          pathToFileURL(counterPath).href
        )};`,
        "",
        "export const helper = { notATable: true };",
        'incrementSchemaLoad("api");',
        "",
        'export const merchants = sqliteTable("merchants", {',
        '  id: text("id").primaryKey(),',
        '  name: text("name").notNull(),',
        "  ...apiSyncColumns(),",
        "});",
        "",
      ].join("\n")
    );
    const localPath = createTmpSchemaFile(
      tmpDir,
      "synced-schema.ts",
      [
        `import { sqliteTable, text } from ${JSON.stringify(sqliteCorePath)};`,
        `import { localSyncColumns } from ${JSON.stringify(schemaIndexPath)};`,
        `import { incrementSchemaLoad } from ${JSON.stringify(
          pathToFileURL(counterPath).href
        )};`,
        "",
        "export const helper = { notATable: true };",
        'incrementSchemaLoad("local");',
        "",
        'export const merchants = sqliteTable("merchants", {',
        '  id: text("id").primaryKey(),',
        '  name: text("name").notNull(),',
        "  ...localSyncColumns(),",
        "});",
        "",
      ].join("\n")
    );

    const config = defineSyncConfig({
      apiSyncedSchema: apiPath,
      localSyncedSchema: localPath,
      outputDir: path.join(tmpDir, "generated"),
      tables: {
        merchants: { scopeColumn: "id" },
      },
    });

    await generateSyncArtifacts(config);

    const today = new Date().toISOString().slice(0, 10);
    const generatedDir = path.join(tmpDir, "generated", today);
    expect(fs.existsSync(path.join(generatedDir, "sync-contract.json"))).toBe(
      true
    );
    expect(fs.existsSync(path.join(generatedDir, "api-synced-schema.ts"))).toBe(
      true
    );
    expect(
      fs.existsSync(path.join(generatedDir, "local-synced-schema.ts"))
    ).toBe(true);

    const counterModule = (await import(pathToFileURL(counterPath).href)) as {
      schemaLoadCounts: { api: number; local: number };
    };
    expect(counterModule.schemaLoadCounts).toEqual({ api: 1, local: 1 });

    const contractJson = JSON.parse(
      fs.readFileSync(path.join(generatedDir, "sync-contract.json"), "utf-8")
    ) as Record<string, unknown>;
    expect(contractJson.tables).toBeDefined();
    const tables = contractJson.tables as Record<
      string,
      Record<string, unknown>
    >;
    expect(tables.merchants).toBeDefined();
    expect(tables.merchants).not.toHaveProperty("table");
    expect(tables.merchants).not.toHaveProperty("indexes");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
