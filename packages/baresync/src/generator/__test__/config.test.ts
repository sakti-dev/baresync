import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { apiSyncColumns, localSyncColumns } from "../../schema/row-state";
import { defineSyncConfig, type SyncConfigTables } from "../config";
import { generateSyncArtifacts } from "../index";

const localCategories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  scopeId: text("scope_id").notNull(),
  name: text("name").notNull(),
  ...localSyncColumns(),
});

const apiCategories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  scopeId: text("scope_id").notNull(),
  name: text("name").notNull(),
  ...apiSyncColumns(),
});

const localProducts = sqliteTable("products", {
  id: text("id").primaryKey(),
  scopeId: text("scope_id").notNull(),
  categoryId: text("category_id")
    .notNull()
    .references(() => localCategories.id),
  name: text("name").notNull(),
  ...localSyncColumns(),
});

const apiProducts = sqliteTable("products", {
  id: text("id").primaryKey(),
  scopeId: text("scope_id").notNull(),
  categoryId: text("category_id")
    .notNull()
    .references(() => apiCategories.id),
  name: text("name").notNull(),
  ...apiSyncColumns(),
});

const localSyncedSchema = {
  categories: localCategories,
  products: localProducts,
} as const;

const apiSyncedSchema = {
  categories: apiCategories,
  products: apiProducts,
} as const;

describe("defineSyncConfig", () => {
  it("builds a generator config from paired local/API schemas without packageName", () => {
    const config = defineSyncConfig({
      apiSyncedSchema,
      localSyncedSchema,
      outputDir: "./generated",
      tables: {
        categories: { scope: "scope_id" },
        products: { scope: "scope_id" },
      },
    });

    expect(config.outputDir).toBe("./generated");
    expect(config.contract.encoding).toBe("json");
    expect(config.contract.tablesMeta.map((t) => t.tableName)).toEqual([
      "categories",
      "products",
    ]);
  });

  it("can be passed directly to generateSyncArtifacts", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-config-"));
    const config = defineSyncConfig({
      apiSyncedSchema,
      localSyncedSchema,
      outputDir: tmpDir,
      tables: {
        categories: { scope: "scope_id" },
        products: { scope: "scope_id" },
      },
    });

    generateSyncArtifacts(config);

    const today = new Date().toISOString().slice(0, 10);
    const contractPath = path.join(tmpDir, today, "sync-contract.json");
    expect(fs.existsSync(contractPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(contractPath, "utf-8"));
    expect(parsed.upsertOrder).toEqual(["categories", "products"]);
    expect(parsed).not.toHaveProperty("packageName");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("applies supported local-only and server-only column defaults", () => {
    const config = defineSyncConfig({
      apiSyncedSchema,
      localSyncedSchema,
      outputDir: "./generated",
      tables: {
        categories: { scope: "scope_id" },
      },
    });

    expect(config.contract.tablesMeta[0]?.localOnlyColumns).toEqual([
      "isSynced",
    ]);
    expect(config.contract.tablesMeta[0]?.serverOnlyColumns).toEqual([
      "syncUpdatedAt",
    ]);
  });

  it("accepts explicit local-only and server-only column overrides", () => {
    const localWithDraft = sqliteTable("drafts", {
      id: text("id").primaryKey(),
      scopeId: text("scope_id").notNull(),
      name: text("name").notNull(),
      draftNote: text("draft_note"),
      ...localSyncColumns(),
    });
    const apiWithAudit = sqliteTable("drafts", {
      id: text("id").primaryKey(),
      scopeId: text("scope_id").notNull(),
      name: text("name").notNull(),
      auditVersion: integer("audit_version").notNull(),
      ...apiSyncColumns(),
    });

    const config = defineSyncConfig({
      apiSyncedSchema: { drafts: apiWithAudit },
      localSyncedSchema: { drafts: localWithDraft },
      outputDir: "./generated",
      tables: {
        drafts: {
          localOnlyColumns: ["draftNote", "isSynced"],
          scope: "scope_id",
          serverOnlyColumns: ["auditVersion", "syncUpdatedAt"],
        },
      },
    });

    expect(config.contract.tablesMeta[0]?.localOnlyColumns).toEqual([
      "draftNote",
      "isSynced",
    ]);
    expect(config.contract.tablesMeta[0]?.serverOnlyColumns).toEqual([
      "auditVersion",
      "syncUpdatedAt",
    ]);
  });

  it("rejects unknown table keys at the type level", () => {
    const invalidTables = {
      // @ts-expect-error unknown table keys are not part of both schemas
      missing: { scope: "scope_id" },
    } satisfies SyncConfigTables<
      typeof localSyncedSchema,
      typeof apiSyncedSchema
    >;

    expect(invalidTables).toBeDefined();
  });

  it("fails when a configured table is missing from the API schema", () => {
    expect(() =>
      defineSyncConfig({
        apiSyncedSchema: {},
        localSyncedSchema: { categories: localCategories },
        outputDir: "./generated",
        tables: {
          categories: { scope: "scope_id" },
        },
      })
    ).toThrow('API synced schema is missing table export "categories"');
  });

  it("fails when a configured table is missing from the local schema", () => {
    expect(() =>
      defineSyncConfig({
        apiSyncedSchema: { categories: apiCategories },
        localSyncedSchema: {},
        outputDir: "./generated",
        tables: {
          categories: { scope: "scope_id" },
        },
      })
    ).toThrow('Local synced schema is missing table export "categories"');
  });

  it("fails on unexpected local-only columns", () => {
    const localWithExtra = sqliteTable("notes", {
      id: text("id").primaryKey(),
      scopeId: text("scope_id").notNull(),
      name: text("name").notNull(),
      localNote: text("local_note"),
      ...localSyncColumns(),
    });
    const apiWithoutExtra = sqliteTable("notes", {
      id: text("id").primaryKey(),
      scopeId: text("scope_id").notNull(),
      name: text("name").notNull(),
      ...apiSyncColumns(),
    });

    expect(() =>
      defineSyncConfig({
        apiSyncedSchema: { notes: apiWithoutExtra },
        localSyncedSchema: { notes: localWithExtra },
        outputDir: "./generated",
        tables: {
          notes: { scope: "scope_id" },
        },
      })
    ).toThrow('unexpected local-only column "local_note"');
  });

  it("fails on unexpected server-only columns", () => {
    const localWithoutExtra = sqliteTable("audits", {
      id: text("id").primaryKey(),
      scopeId: text("scope_id").notNull(),
      name: text("name").notNull(),
      ...localSyncColumns(),
    });
    const apiWithExtra = sqliteTable("audits", {
      id: text("id").primaryKey(),
      scopeId: text("scope_id").notNull(),
      name: text("name").notNull(),
      auditVersion: integer("audit_version").notNull(),
      ...apiSyncColumns(),
    });

    expect(() =>
      defineSyncConfig({
        apiSyncedSchema: { audits: apiWithExtra },
        localSyncedSchema: { audits: localWithoutExtra },
        outputDir: "./generated",
        tables: {
          audits: { scope: "scope_id" },
        },
      })
    ).toThrow('unexpected server-only column "audit_version"');
  });
});

describe("schema snapshot", () => {
  it("copies api-synced-schema.ts into generated dated directory", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-snap-"));
    const schemaDir = path.join(tmpDir, "schemas");
    fs.mkdirSync(schemaDir);

    const apiContent =
      'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const test = sqliteTable("test", { id: text("id").primaryKey() });\n';
    const localContent =
      'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const test = sqliteTable("test", { id: text("id").primaryKey() });\n';

    fs.writeFileSync(path.join(schemaDir, "api-synced-schema.ts"), apiContent);
    fs.writeFileSync(
      path.join(schemaDir, "local-synced-schema.ts"),
      localContent
    );

    const config = defineSyncConfig({
      apiSyncedSchema,
      localSyncedSchema,
      outputDir: path.join(tmpDir, "generated"),
      schemaSourceDir: schemaDir,
      tables: {
        categories: { scope: "scope_id" },
        products: { scope: "scope_id" },
      },
    });

    generateSyncArtifacts(config);

    const today = new Date().toISOString().slice(0, 10);
    const snapshotPath = path.join(
      tmpDir,
      "generated",
      today,
      "api-synced-schema.ts"
    );
    expect(fs.existsSync(snapshotPath)).toBe(true);
    expect(fs.readFileSync(snapshotPath, "utf-8")).toBe(apiContent);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("copies local-synced-schema.ts into generated dated directory", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-snap-"));
    const schemaDir = path.join(tmpDir, "schemas");
    fs.mkdirSync(schemaDir);

    const localContent = "// local schema content\nexport const test = {};\n";

    fs.writeFileSync(path.join(schemaDir, "api-synced-schema.ts"), "// api\n");
    fs.writeFileSync(
      path.join(schemaDir, "local-synced-schema.ts"),
      localContent
    );

    const config = defineSyncConfig({
      apiSyncedSchema,
      localSyncedSchema,
      outputDir: path.join(tmpDir, "generated"),
      schemaSourceDir: schemaDir,
      tables: {
        categories: { scope: "scope_id" },
      },
    });

    generateSyncArtifacts(config);

    const today = new Date().toISOString().slice(0, 10);
    const snapshotPath = path.join(
      tmpDir,
      "generated",
      today,
      "local-synced-schema.ts"
    );
    expect(fs.existsSync(snapshotPath)).toBe(true);
    expect(fs.readFileSync(snapshotPath, "utf-8")).toBe(localContent);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("does not modify old snapshot when regenerating after schema edit", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-snap-"));
    const schemaDir = path.join(tmpDir, "schemas");
    fs.mkdirSync(schemaDir);

    const v1Content = "// v1 schema\n";
    fs.writeFileSync(path.join(schemaDir, "api-synced-schema.ts"), v1Content);
    fs.writeFileSync(path.join(schemaDir, "local-synced-schema.ts"), v1Content);

    const config = defineSyncConfig({
      apiSyncedSchema,
      localSyncedSchema,
      outputDir: path.join(tmpDir, "generated"),
      schemaSourceDir: schemaDir,
      tables: {
        categories: { scope: "scope_id" },
      },
    });

    generateSyncArtifacts(config);

    const today = new Date().toISOString().slice(0, 10);
    const snapshotPath = path.join(
      tmpDir,
      "generated",
      today,
      "api-synced-schema.ts"
    );
    expect(fs.readFileSync(snapshotPath, "utf-8")).toBe(v1Content);

    const v2Content = "// v2 schema - EDITED\n";
    fs.writeFileSync(path.join(schemaDir, "api-synced-schema.ts"), v2Content);

    generateSyncArtifacts(config);

    expect(fs.readFileSync(snapshotPath, "utf-8")).toBe(v2Content);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
