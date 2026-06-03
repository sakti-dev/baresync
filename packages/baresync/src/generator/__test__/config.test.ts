import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defineSyncConfig } from "../config";

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
});
