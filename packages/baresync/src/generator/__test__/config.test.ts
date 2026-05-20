import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { apiSyncColumns, localSyncColumns } from "../../schema/row-state";
import {
  defineProtobufSyncConfig,
  defineSyncConfig,
  type SyncConfigTables,
} from "../config";
import {
  generateProtobufWorkspaceArtifacts,
  generateSyncArtifacts,
} from "../index";

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
  it("builds a generator config from paired local/API schemas", () => {
    const config = defineSyncConfig({
      apiSyncedSchema,
      localSyncedSchema,
      outputDir: "./generated",
      packageName: "test.sync.v1",
      tables: {
        categories: { scope: "scope_id" },
        products: { scope: "scope_id" },
      },
    });

    expect(config.outputDir).toBe("./generated");
    expect(config.contract.packageName).toBe("test.sync.v1");
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
      packageName: "test.sync.v1",
      tables: {
        categories: { scope: "scope_id" },
        products: { scope: "scope_id" },
      },
    });

    generateSyncArtifacts(config);

    const contractPath = path.join(tmpDir, "sync-contract.json");
    expect(fs.existsSync(contractPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(contractPath, "utf-8"));
    expect(parsed.upsertOrder).toEqual(["categories", "products"]);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("applies supported local-only and server-only column defaults", () => {
    const config = defineSyncConfig({
      apiSyncedSchema,
      localSyncedSchema,
      outputDir: "./generated",
      packageName: "test.sync.v1",
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
      packageName: "test.sync.v1",
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
        packageName: "test.sync.v1",
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
        packageName: "test.sync.v1",
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
        packageName: "test.sync.v1",
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
        packageName: "test.sync.v1",
        tables: {
          audits: { scope: "scope_id" },
        },
      })
    ).toThrow('unexpected server-only column "audit_version"');
  });
});

describe("defineProtobufSyncConfig", () => {
  it("builds a protobuf workspace config from paired local/API schemas", () => {
    const config = defineProtobufSyncConfig({
      apiSyncedSchema,
      localSyncedSchema,
      outputDir: "./generated",
      outputs: {
        proto: "./generated/sync.proto",
        runtimeSourceTs: "./generated/runtime-source.ts",
        runtimeTs: "./generated/runtime.ts",
        rustSyncMappers: "./generated/sync-mappers.rs",
        syncTs: "./generated/sync.generated.ts",
      },
      packageName: "test.sync.v1",
      tables: {
        categories: { scope: "scope_id" },
        products: { scope: "scope_id" },
      },
    });

    expect(config.outputDir).toBe("./generated");
    expect(config.contract.packageName).toBe("test.sync.v1");
    expect(config.contract.encoding).toBe("protobuf");
    expect(config.outputs.proto).toBe("./generated/sync.proto");
  });

  it("can be passed directly to generateProtobufWorkspaceArtifacts", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-proto-"));
    const config = defineProtobufSyncConfig({
      apiSyncedSchema,
      localSyncedSchema,
      outputDir: tmpDir,
      outputs: {
        proto: path.join(tmpDir, "sync.proto"),
        runtimeSourceTs: path.join(tmpDir, "runtime-source.ts"),
        runtimeTs: path.join(tmpDir, "runtime.ts"),
        rustSyncMappers: path.join(tmpDir, "sync-mappers.rs"),
        syncTs: path.join(tmpDir, "sync.generated.ts"),
      },
      packageName: "test.sync.v1",
      tables: {
        categories: { scope: "scope_id" },
      },
    });

    generateProtobufWorkspaceArtifacts(config);

    expect(fs.existsSync(path.join(tmpDir, "sync.proto"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "sync.generated.ts"))).toBe(true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
