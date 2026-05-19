import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  integer,
  numeric,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import type {
  SyncContract,
  SyncContractTableMeta,
} from "../../schema/contract";
import { defineSyncContract } from "../../schema/contract";
import type { SyncedTableDefinition } from "../../schema/synced-table";
import { defineSyncedTable } from "../../schema/synced-table";
import { runDiagnostics } from "../diagnostics";
import { generateSyncArtifacts, SyncDiagnosticError } from "../index";

function makeValidTable(name: string) {
  return sqliteTable(name, {
    id: text("id").primaryKey(),
    scope: text("scope").notNull(),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
    isSynced: integer("is_synced", { mode: "boolean" })
      .notNull()
      .default(false),
  });
}

function makeSyncedDef(table: ReturnType<typeof makeValidTable>) {
  return defineSyncedTable({
    table,
    scope: { source: "scope", field: "scope", column: table.scope },
    conflict: { strategy: "last-write-wins", column: table.updatedAt },
    delete: { mode: "soft", column: table.deletedAt },
  });
}

function makeValidContract(tables: ReturnType<typeof makeSyncedDef>[]) {
  return defineSyncContract({
    encoding: "json",
    packageName: "test.sync.v1",
    tables,
  });
}

function buildRawContract(
  tables: Array<{
    table: unknown;
    scopeField: string;
    localOnlyColumns?: string[];
    conflict?: { strategy: string; column: unknown };
    delete?: { mode: string; column: unknown };
  }>
): SyncContract {
  const { getTableConfig: gtc } =
    require("drizzle-orm/sqlite-core") as typeof import("drizzle-orm/sqlite-core");
  const defs: SyncedTableDefinition[] = tables.map((t) => ({
    table: t.table as SyncedTableDefinition["table"],
    scope: {
      source: "scope" as const,
      field: t.scopeField,
      column: null as never,
    },
    localOnlyColumns: t.localOnlyColumns,
    conflict: t.conflict as unknown as SyncedTableDefinition["conflict"],
    delete: t.delete as unknown as SyncedTableDefinition["delete"],
  }));

  const tablesMeta: SyncContractTableMeta[] = tables.map((t) => {
    const config = gtc(t.table as Parameters<typeof gtc>[0]);
    return {
      tableName: config.name,
      columns: config.columns.map((c) => c.name),
      scope: { field: t.scopeField },
      localOnlyColumns: t.localOnlyColumns ?? [],
      serverOnlyColumns: [],
    };
  });

  return {
    encoding: "json",
    packageName: "test.raw.v1",
    tables: defs,
    tablesMeta,
    limits: { maxPushBytes: 2_097_152, maxPushRows: 2000 },
  };
}

describe("runDiagnostics", () => {
  it("returns no errors for a valid contract", () => {
    const table = makeValidTable("valid_table");
    const def = makeSyncedDef(table);
    const contract = makeValidContract([def]);
    const diagnostics = runDiagnostics(contract);
    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toEqual([]);
  });

  it("reports SYNC_SCHEMA_MISSING_PRIMARY_KEY for table without PK", () => {
    const table = sqliteTable("no_pk", {
      scope: text("scope").notNull(),
      deletedAt: text("deleted_at"),
      createdAt: text("created_at").notNull(),
      updatedAt: text("updated_at").notNull(),
    });
    const contract = buildRawContract([{ table, scopeField: "scope" }]);
    const diagnostics = runDiagnostics(contract);
    expect(
      diagnostics.some((d) => d.code === "SYNC_SCHEMA_MISSING_PRIMARY_KEY")
    ).toBe(true);
  });

  it("reports SYNC_SCHEMA_UNSUPPORTED_PRIMARY_KEY for integer PK", () => {
    const table = sqliteTable("bad_pk", {
      myId: integer("my_id").primaryKey(),
      scope: text("scope").notNull(),
      deletedAt: text("deleted_at"),
      createdAt: text("created_at").notNull(),
      updatedAt: text("updated_at").notNull(),
    });
    const contract = buildRawContract([{ table, scopeField: "scope" }]);
    const diagnostics = runDiagnostics(contract);
    expect(
      diagnostics.some((d) => d.code === "SYNC_SCHEMA_UNSUPPORTED_PRIMARY_KEY")
    ).toBe(true);
  });

  it("reports SYNC_SCHEMA_UNSUPPORTED_PRIMARY_KEY for composite PK", () => {
    const table = sqliteTable(
      "composite_pk",
      {
        a: text("a"),
        b: text("b"),
        scope: text("scope").notNull(),
        deletedAt: text("deleted_at"),
        createdAt: text("created_at").notNull(),
        updatedAt: text("updated_at").notNull(),
      },
      (t) => [primaryKey({ columns: [t.a, t.b] })]
    );
    const contract = buildRawContract([{ table, scopeField: "scope" }]);
    const diagnostics = runDiagnostics(contract);
    expect(
      diagnostics.some((d) => d.code === "SYNC_SCHEMA_UNSUPPORTED_PRIMARY_KEY")
    ).toBe(true);
  });

  it("reports SYNC_SCHEMA_MISSING_DELETED_AT when column missing", () => {
    const table = sqliteTable("no_deleted", {
      id: text("id").primaryKey(),
      scope: text("scope").notNull(),
      createdAt: text("created_at").notNull(),
      updatedAt: text("updated_at").notNull(),
    });
    const contract = buildRawContract([{ table, scopeField: "scope" }]);
    const diagnostics = runDiagnostics(contract);
    expect(
      diagnostics.some((d) => d.code === "SYNC_SCHEMA_MISSING_DELETED_AT")
    ).toBe(true);
  });

  it("reports SYNC_SCHEMA_MISSING_ROW_STATE_COLUMN for missing created_at", () => {
    const table = sqliteTable("no_created", {
      id: text("id").primaryKey(),
      scope: text("scope").notNull(),
      deletedAt: text("deleted_at"),
      updatedAt: text("updated_at").notNull(),
    });
    const contract = buildRawContract([{ table, scopeField: "scope" }]);
    const diagnostics = runDiagnostics(contract);
    expect(
      diagnostics.some(
        (d) =>
          d.code === "SYNC_SCHEMA_MISSING_ROW_STATE_COLUMN" &&
          d.column === "created_at"
      )
    ).toBe(true);
  });

  it("reports SYNC_SCHEMA_MISSING_ROW_STATE_COLUMN for missing updated_at", () => {
    const table = sqliteTable("no_updated", {
      id: text("id").primaryKey(),
      scope: text("scope").notNull(),
      deletedAt: text("deleted_at"),
      createdAt: text("created_at").notNull(),
    });
    const contract = buildRawContract([{ table, scopeField: "scope" }]);
    const diagnostics = runDiagnostics(contract);
    expect(
      diagnostics.some(
        (d) =>
          d.code === "SYNC_SCHEMA_MISSING_ROW_STATE_COLUMN" &&
          d.column === "updated_at"
      )
    ).toBe(true);
  });

  it("reports SYNC_SCHEMA_MISSING_SYNC_UPDATED_AT", () => {
    const table = sqliteTable("no_sync_updated", {
      id: text("id").primaryKey(),
      scope: text("scope").notNull(),
      deletedAt: text("deleted_at"),
      createdAt: text("created_at").notNull(),
      updatedAt: text("updated_at").notNull(),
    });
    const contract = buildRawContract([{ table, scopeField: "scope" }]);
    const diagnostics = runDiagnostics(contract);
    expect(
      diagnostics.some((d) => d.code === "SYNC_SCHEMA_MISSING_SYNC_UPDATED_AT")
    ).toBe(true);
  });

  it("reports SYNC_SCHEMA_MISSING_LOCAL_IS_SYNCED", () => {
    const table = sqliteTable("no_is_synced", {
      id: text("id").primaryKey(),
      scope: text("scope").notNull(),
      deletedAt: text("deleted_at"),
      createdAt: text("created_at").notNull(),
      updatedAt: text("updated_at").notNull(),
      syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
    });
    const contract = buildRawContract([{ table, scopeField: "scope" }]);
    const diagnostics = runDiagnostics(contract);
    expect(
      diagnostics.some((d) => d.code === "SYNC_SCHEMA_MISSING_LOCAL_IS_SYNCED")
    ).toBe(true);
  });

  it("does not report SYNC_SCHEMA_MISSING_LOCAL_IS_SYNCED when in localOnlyColumns", () => {
    const table = sqliteTable("has_local_synced", {
      id: text("id").primaryKey(),
      scope: text("scope").notNull(),
      deletedAt: text("deleted_at"),
      createdAt: text("created_at").notNull(),
      updatedAt: text("updated_at").notNull(),
      syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
    });
    const contract = buildRawContract([
      { table, scopeField: "scope", localOnlyColumns: ["is_synced"] },
    ]);
    const diagnostics = runDiagnostics(contract);
    expect(
      diagnostics.some((d) => d.code === "SYNC_SCHEMA_MISSING_LOCAL_IS_SYNCED")
    ).toBe(false);
  });

  it("reports SYNC_SCHEMA_DUPLICATE_TABLE_NAME", () => {
    const t1 = makeValidTable("dup_table");
    const t2 = makeValidTable("dup_table");
    const d1 = makeSyncedDef(t1);
    const d2 = makeSyncedDef(t2);
    const contract = defineSyncContract({
      encoding: "json",
      packageName: "test",
      tables: [d1, d2],
    });
    const diagnostics = runDiagnostics(contract);
    expect(
      diagnostics.some((d) => d.code === "SYNC_SCHEMA_DUPLICATE_TABLE_NAME")
    ).toBe(true);
  });

  it("reports SYNC_SCHEMA_NO_CONFLICT_STRATEGY as warning", () => {
    const table = makeValidTable("no_conflict");
    const def = defineSyncedTable({
      table,
      scope: { source: "scope", field: "scope", column: table.scope },
    });
    const contract = defineSyncContract({
      encoding: "json",
      packageName: "test",
      tables: [def],
    });
    const diagnostics = runDiagnostics(contract);
    const warning = diagnostics.find(
      (d) => d.code === "SYNC_SCHEMA_NO_CONFLICT_STRATEGY"
    );
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe("warning");
  });

  it("reports SYNC_SCHEMA_NO_DELETE_STRATEGY as warning", () => {
    const table = makeValidTable("no_delete_strategy");
    const def = defineSyncedTable({
      table,
      scope: { source: "scope", field: "scope", column: table.scope },
    });
    const contract = defineSyncContract({
      encoding: "json",
      packageName: "test",
      tables: [def],
    });
    const diagnostics = runDiagnostics(contract);
    const warning = diagnostics.find(
      (d) => d.code === "SYNC_SCHEMA_NO_DELETE_STRATEGY"
    );
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe("warning");
  });

  it("reports SYNC_SCHEMA_NULLABLE_SCOPE_COLUMN as warning", () => {
    const table = sqliteTable("nullable_scope", {
      id: text("id").primaryKey(),
      scope: text("scope"),
      deletedAt: text("deleted_at"),
      createdAt: text("created_at").notNull(),
      updatedAt: text("updated_at").notNull(),
      syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
      isSynced: integer("is_synced", { mode: "boolean" })
        .notNull()
        .default(false),
    });
    const contract = buildRawContract([
      {
        table,
        scopeField: "scope",
        conflict: { strategy: "last-write-wins", column: table.updatedAt },
        delete: { mode: "soft", column: table.deletedAt },
      },
    ]);
    const diagnostics = runDiagnostics(contract);
    const warning = diagnostics.find(
      (d) => d.code === "SYNC_SCHEMA_NULLABLE_SCOPE_COLUMN"
    );
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe("warning");
  });

  it("reports SYNC_INDEX_MISSING_SCOPE_WATERMARK as warning", () => {
    const table = makeValidTable("watermark_table");
    const def = makeSyncedDef(table);
    const contract = makeValidContract([def]);
    const diagnostics = runDiagnostics(contract);
    const warnings = diagnostics.filter(
      (d) => d.code === "SYNC_INDEX_MISSING_SCOPE_WATERMARK"
    );
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings.every((w) => w.severity === "warning")).toBe(true);
  });

  it("reports SYNC_INDEX_MISSING_LOCAL_DIRTY when is_synced present", () => {
    const table = makeValidTable("dirty_table");
    const def = makeSyncedDef(table);
    const contract = makeValidContract([def]);
    const diagnostics = runDiagnostics(contract);
    const warning = diagnostics.find(
      (d) => d.code === "SYNC_INDEX_MISSING_LOCAL_DIRTY"
    );
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe("warning");
  });

  it("reports SYNC_SCHEMA_LARGE_TEXT_FIELD for text column with length > 10000", () => {
    const table = sqliteTable("large_text", {
      id: text("id").primaryKey(),
      scope: text("scope").notNull(),
      deletedAt: text("deleted_at"),
      createdAt: text("created_at").notNull(),
      updatedAt: text("updated_at").notNull(),
      syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
      isSynced: integer("is_synced", { mode: "boolean" })
        .notNull()
        .default(false),
      bio: text("bio", { length: 50_000 }),
    });
    const def = defineSyncedTable({
      table,
      scope: { source: "scope", field: "scope", column: table.scope },
    });
    const contract = defineSyncContract({
      encoding: "json",
      packageName: "test",
      tables: [def],
    });
    const diagnostics = runDiagnostics(contract);
    const warning = diagnostics.find(
      (d) => d.code === "SYNC_SCHEMA_LARGE_TEXT_FIELD" && d.column === "bio"
    );
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe("warning");
  });

  it("does not report SYNC_SCHEMA_LARGE_TEXT_FIELD for text without length", () => {
    const table = sqliteTable("normal_text", {
      id: text("id").primaryKey(),
      scope: text("scope").notNull(),
      deletedAt: text("deleted_at"),
      createdAt: text("created_at").notNull(),
      updatedAt: text("updated_at").notNull(),
      syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
      isSynced: integer("is_synced", { mode: "boolean" })
        .notNull()
        .default(false),
      bio: text("bio"),
    });
    const def = defineSyncedTable({
      table,
      scope: { source: "scope", field: "scope", column: table.scope },
    });
    const contract = defineSyncContract({
      encoding: "json",
      packageName: "test",
      tables: [def],
    });
    const diagnostics = runDiagnostics(contract);
    expect(
      diagnostics.some(
        (d) => d.code === "SYNC_SCHEMA_LARGE_TEXT_FIELD" && d.column === "bio"
      )
    ).toBe(false);
  });

  it("reports SYNC_SCHEMA_REQUIRED_EXTERNAL_FK", () => {
    const external = sqliteTable("external", {
      id: text("id").primaryKey(),
    });
    const items = sqliteTable("items_with_fk", {
      id: text("id").primaryKey(),
      scope: text("scope").notNull(),
      externalId: text("external_id")
        .notNull()
        .references(() => external.id),
      deletedAt: text("deleted_at"),
      createdAt: text("created_at").notNull(),
      updatedAt: text("updated_at").notNull(),
      syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
      isSynced: integer("is_synced", { mode: "boolean" })
        .notNull()
        .default(false),
    });
    const def = defineSyncedTable({
      table: items,
      scope: { source: "scope", field: "scope", column: items.scope },
    });
    const contract = defineSyncContract({
      encoding: "json",
      packageName: "test",
      tables: [def],
    });
    const diagnostics = runDiagnostics(contract);
    expect(
      diagnostics.some((d) => d.code === "SYNC_SCHEMA_REQUIRED_EXTERNAL_FK")
    ).toBe(true);
  });

  it("reports SYNC_SCHEMA_FK_CYCLE", () => {
    let bTable: unknown;
    const a = sqliteTable("cycle_a", {
      id: text("id").primaryKey(),
      scope: text("scope").notNull(),
      bId: text("b_id")
        .notNull()
        .references(
          () => (bTable as { id: unknown }).id as ReturnType<typeof text>,
          { onDelete: "cascade" }
        ),
      deletedAt: text("deleted_at"),
      createdAt: text("created_at").notNull(),
      updatedAt: text("updated_at").notNull(),
      syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
      isSynced: integer("is_synced", { mode: "boolean" })
        .notNull()
        .default(false),
    });
    bTable = sqliteTable("cycle_b", {
      id: text("id").primaryKey(),
      scope: text("scope").notNull(),
      aId: text("a_id")
        .notNull()
        .references(() => a.id, { onDelete: "cascade" }),
      deletedAt: text("deleted_at"),
      createdAt: text("created_at").notNull(),
      updatedAt: text("updated_at").notNull(),
      syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
      isSynced: integer("is_synced", { mode: "boolean" })
        .notNull()
        .default(false),
    });

    const contract = buildRawContract([
      { table: a, scopeField: "scope" },
      { table: bTable, scopeField: "scope" },
    ]);
    const diagnostics = runDiagnostics(contract);
    expect(diagnostics.some((d) => d.code === "SYNC_SCHEMA_FK_CYCLE")).toBe(
      true
    );
  });

  it("reports SYNC_SCHEMA_ENCODING_UNSUPPORTED for unknown encoding", () => {
    const table = makeValidTable("encoding_table");
    const def = makeSyncedDef(table);
    const contract = defineSyncContract({
      encoding: "json",
      packageName: "test",
      tables: [def],
    });
    (contract as { encoding: string }).encoding = "xml";
    const diagnostics = runDiagnostics(contract);
    expect(
      diagnostics.some((d) => d.code === "SYNC_SCHEMA_ENCODING_UNSUPPORTED")
    ).toBe(true);
  });

  it("reports SYNC_SCHEMA_MISSING_SCOPE_COLUMN when scope field not found", () => {
    const table = sqliteTable("no_scope", {
      id: text("id").primaryKey(),
      name: text("name").notNull(),
      deletedAt: text("deleted_at"),
      createdAt: text("created_at").notNull(),
      updatedAt: text("updated_at").notNull(),
      syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
      isSynced: integer("is_synced", { mode: "boolean" })
        .notNull()
        .default(false),
    });
    const contract = buildRawContract([{ table, scopeField: "missingScope" }]);
    const diagnostics = runDiagnostics(contract);
    expect(
      diagnostics.some((d) => d.code === "SYNC_SCHEMA_MISSING_SCOPE_COLUMN")
    ).toBe(true);
  });

  it("reports SYNC_SCHEMA_UNSUPPORTED_COLUMN_TYPE for numeric column", () => {
    const table = sqliteTable("bad_type", {
      id: text("id").primaryKey(),
      scope: text("scope").notNull(),
      deletedAt: text("deleted_at"),
      createdAt: text("created_at").notNull(),
      updatedAt: text("updated_at").notNull(),
      syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
      isSynced: integer("is_synced", { mode: "boolean" })
        .notNull()
        .default(false),
      amount: numeric("amount"),
    });
    const contract = buildRawContract([{ table, scopeField: "scope" }]);
    const diagnostics = runDiagnostics(contract);
    expect(
      diagnostics.some(
        (d) =>
          d.code === "SYNC_SCHEMA_UNSUPPORTED_COLUMN_TYPE" &&
          d.column === "amount"
      )
    ).toBe(true);
  });

  it("reports SYNC_SCHEMA_DUPLICATE_FIELD_NAME when columns have same name", () => {
    const table = sqliteTable("dup_col", {
      id: text("id").primaryKey(),
      scope: text("scope").notNull(),
      deletedAt: text("deleted_at"),
      createdAt: text("created_at").notNull(),
      updatedAt: text("updated_at").notNull(),
      syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
      isSynced: integer("is_synced", { mode: "boolean" })
        .notNull()
        .default(false),
    });
    const contract = buildRawContract([{ table, scopeField: "scope" }]);
    contract.tablesMeta[0].columns.push("created_at");
    const diagnostics = runDiagnostics(contract);
    expect(
      diagnostics.some((d) => d.code === "SYNC_SCHEMA_DUPLICATE_FIELD_NAME")
    ).toBe(true);
  });

  it("reports SYNC_SCHEMA_RESERVED_FIELD_REUSED when id column is integer", () => {
    const table = sqliteTable("bad_id_type", {
      id: integer("id").primaryKey(),
      scope: text("scope").notNull(),
      deletedAt: text("deleted_at"),
      createdAt: text("created_at").notNull(),
      updatedAt: text("updated_at").notNull(),
      syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
      isSynced: integer("is_synced", { mode: "boolean" })
        .notNull()
        .default(false),
    });
    const contract = buildRawContract([{ table, scopeField: "scope" }]);
    const diagnostics = runDiagnostics(contract);
    expect(
      diagnostics.some(
        (d) =>
          d.code === "SYNC_SCHEMA_RESERVED_FIELD_REUSED" && d.column === "id"
      )
    ).toBe(true);
  });

  it("reports SYNC_SCHEMA_JSON_ONLY_FIELD for text json column", () => {
    const table = sqliteTable("json_col", {
      id: text("id").primaryKey(),
      scope: text("scope").notNull(),
      deletedAt: text("deleted_at"),
      createdAt: text("created_at").notNull(),
      updatedAt: text("updated_at").notNull(),
      syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
      isSynced: integer("is_synced", { mode: "boolean" })
        .notNull()
        .default(false),
      metadata: text("metadata", { mode: "json" }),
    });
    const def = defineSyncedTable({
      table,
      scope: { source: "scope", field: "scope", column: table.scope },
    });
    const contract = defineSyncContract({
      encoding: "json",
      packageName: "test",
      tables: [def],
    });
    const diagnostics = runDiagnostics(contract);
    const warning = diagnostics.find(
      (d) => d.code === "SYNC_SCHEMA_JSON_ONLY_FIELD" && d.column === "metadata"
    );
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe("warning");
  });

  it("reports SYNC_SCHEMA_BATTERIES_INCLUDED_COMPLEX_MAPPING for snake_case scope field", () => {
    const table = sqliteTable("complex_scope", {
      id: text("id").primaryKey(),
      merchant_id: text("merchant_id").notNull(),
      deletedAt: text("deleted_at"),
      createdAt: text("created_at").notNull(),
      updatedAt: text("updated_at").notNull(),
      syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
      isSynced: integer("is_synced", { mode: "boolean" })
        .notNull()
        .default(false),
    });
    const contract = buildRawContract([{ table, scopeField: "merchant_id" }]);
    const diagnostics = runDiagnostics(contract);
    expect(
      diagnostics.some(
        (d) => d.code === "SYNC_SCHEMA_BATTERIES_INCLUDED_COMPLEX_MAPPING"
      )
    ).toBe(true);
  });

  it("reports SYNC_SCHEMA_PROTOBUF_FIELD_NUMBER_REUSED for duplicate field numbers", () => {
    const table = makeValidTable("proto_dup");
    const def = makeSyncedDef(table);
    const contract = makeValidContract([def]);
    (contract as { encoding: string }).encoding = "protobuf";
    contract.tablesMeta[0].columns.push("field_a", "field_b");
    const diagnostics = runDiagnostics(contract, {
      previousFieldNumbers: { proto_dup: { field_a: 1, field_b: 1 } },
    });
    expect(
      diagnostics.some(
        (d) => d.code === "SYNC_SCHEMA_PROTOBUF_FIELD_NUMBER_REUSED"
      )
    ).toBe(true);
  });

  it("does not report SYNC_SCHEMA_PROTOBUF_FIELD_NUMBER_REUSED when field numbers are unique", () => {
    const table = makeValidTable("proto_ok");
    const def = makeSyncedDef(table);
    const contract = makeValidContract([def]);
    (contract as { encoding: string }).encoding = "protobuf";
    const diagnostics = runDiagnostics(contract, {
      previousFieldNumbers: { proto_ok: { id: 1, scope: 2 } },
    });
    expect(
      diagnostics.some(
        (d) => d.code === "SYNC_SCHEMA_PROTOBUF_FIELD_NUMBER_REUSED"
      )
    ).toBe(false);
  });

  it("reports SYNC_SCHEMA_BATTERIES_INCLUDED_NOT_1_TO_1 when table has both localOnly and serverOnly columns", () => {
    const table = makeValidTable("split_table");
    const contract = buildRawContract([
      {
        table,
        scopeField: "scope",
        localOnlyColumns: ["is_synced"],
      },
    ]);
    contract.tablesMeta[0].serverOnlyColumns = ["server_secret"];
    const diagnostics = runDiagnostics(contract);
    expect(
      diagnostics.some(
        (d) => d.code === "SYNC_SCHEMA_BATTERIES_INCLUDED_NOT_1_TO_1"
      )
    ).toBe(true);
  });
});

describe("generateSyncArtifacts with diagnostics", () => {
  it("succeeds with only warnings", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-test-"));
    const table = makeValidTable("warn_only_table");
    const def = defineSyncedTable({
      table,
      scope: { source: "scope", field: "scope", column: table.scope },
    });
    const contract = defineSyncContract({
      encoding: "json",
      packageName: "test",
      tables: [def],
    });
    generateSyncArtifacts(contract, tmpDir);
    expect(fs.existsSync(path.join(tmpDir, "sync-contract.json"))).toBe(true);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("succeeds with conflict and delete strategies", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-test-"));
    const table = makeValidTable("full_table");
    const def = makeSyncedDef(table);
    const contract = makeValidContract([def]);
    generateSyncArtifacts(contract, tmpDir);
    expect(fs.existsSync(path.join(tmpDir, "sync-contract.json"))).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, "sync-contract.manifest.json"))
    ).toBe(true);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws when warningsAsErrors is true and warnings exist", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-test-"));
    const table = makeValidTable("warn_as_err");
    const def = defineSyncedTable({
      table,
      scope: { source: "scope", field: "scope", column: table.scope },
    });
    const contract = defineSyncContract({
      encoding: "json",
      packageName: "test",
      tables: [def],
    });
    expect(() =>
      generateSyncArtifacts(contract, tmpDir, {
        warningsAsErrors: true,
      })
    ).toThrow(SyncDiagnosticError);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws SyncDiagnosticError for encoding errors", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-test-"));
    const table = makeValidTable("err_encoding");
    const def = makeSyncedDef(table);
    const contract = defineSyncContract({
      encoding: "json",
      packageName: "test",
      tables: [def],
    });
    (contract as { encoding: string }).encoding = "xml";
    expect(() => generateSyncArtifacts(contract, tmpDir)).toThrow(
      SyncDiagnosticError
    );
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes zero files when errors block generation", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-test-"));
    const table = makeValidTable("err_no_files");
    const def = makeSyncedDef(table);
    const contract = defineSyncContract({
      encoding: "json",
      packageName: "test",
      tables: [def],
    });
    (contract as { encoding: string }).encoding = "xml";
    try {
      generateSyncArtifacts(contract, tmpDir);
    } catch {
      const files = fs.readdirSync(tmpDir);
      expect(files).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("SyncDiagnosticError", () => {
  it("contains diagnostics array with error details", () => {
    const table = makeValidTable("err_diag");
    const def = makeSyncedDef(table);
    const contract = defineSyncContract({
      encoding: "json",
      packageName: "test",
      tables: [def],
    });
    (contract as { encoding: string }).encoding = "csv";
    try {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-test-"));
      generateSyncArtifacts(contract, tmpDir);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(SyncDiagnosticError);
      const diagErr = err as SyncDiagnosticError;
      expect(diagErr.diagnostics.length).toBeGreaterThan(0);
      expect(diagErr.diagnostics.some((d) => d.severity === "error")).toBe(
        true
      );
    }
  });
});

describe("SYNC_COMPAT_ADDITIVE_CHANGE", () => {
  it("warns when a previous manifest has a table not in current contract", () => {
    const table = makeValidTable("existing_table");
    const def = makeSyncedDef(table);
    const contract = makeValidContract([def]);
    const diagnostics = runDiagnostics(contract, {
      previousTables: ["existing_table", "removed_table"],
    });
    const warning = diagnostics.find(
      (d) => d.code === "SYNC_COMPAT_ADDITIVE_CHANGE"
    );
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe("warning");
    expect(warning!.table).toBe("removed_table");
  });

  it("does not warn when tables match", () => {
    const table = makeValidTable("stable_table");
    const def = makeSyncedDef(table);
    const contract = makeValidContract([def]);
    const diagnostics = runDiagnostics(contract, {
      previousTables: ["stable_table"],
    });
    expect(
      diagnostics.some((d) => d.code === "SYNC_COMPAT_ADDITIVE_CHANGE")
    ).toBe(false);
  });

  it("does not warn when no previous manifest provided", () => {
    const table = makeValidTable("fresh_table");
    const def = makeSyncedDef(table);
    const contract = makeValidContract([def]);
    const diagnostics = runDiagnostics(contract);
    expect(
      diagnostics.some((d) => d.code === "SYNC_COMPAT_ADDITIVE_CHANGE")
    ).toBe(false);
  });
});
