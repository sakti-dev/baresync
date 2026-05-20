import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTableConfig, type SQLiteColumn } from "drizzle-orm/sqlite-core";
import type { SyncContract } from "../schema/contract";
import { computeSyncTableOrder, type SyncTableOrder } from "./fk-order";
import { writeManifest } from "./manifest";
import {
  type ProtobufScalarType,
  type ProtobufTableDescriptor,
  writeSyncContractJson,
  writeTableOrderConstants,
} from "./outputs";

export interface ProtobufWorkspaceOutputs {
  proto: string;
  runtimeSourceTs: string;
  runtimeTs: string;
  rustSyncMappers: string;
  syncTs: string;
}

export interface ProtobufWorkspaceConfig {
  contract: SyncContract;
  outputDir: string;
  outputs: ProtobufWorkspaceOutputs;
}

const NON_ALPHANUMERIC_RE = /[^a-zA-Z0-9]/;
const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const RUNTIME_TEMPLATE_PATH = path.join(
  PACKAGE_ROOT,
  "src",
  "generator",
  "protobuf-runtime.ts"
);

function toPascalCase(input: string): string {
  return input
    .split(NON_ALPHANUMERIC_RE)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("");
}

function buildProtobufScalarType(column: SQLiteColumn): ProtobufScalarType {
  if (column.columnType === "SQLiteBoolean") {
    return "bool";
  }
  if (column.columnType === "SQLiteBlobBuffer") {
    return "bytes";
  }
  if (column.columnType === "SQLiteReal") {
    return "double";
  }
  if (column.columnType === "SQLiteInteger") {
    return "int64";
  }
  return "string";
}

function buildProtobufTableDescriptor(input: {
  tableName: string;
  tableIndex: number;
  table: SyncContract["tables"][number];
}): ProtobufTableDescriptor {
  const config = getTableConfig(input.table.table);
  const columns = config.columns as SQLiteColumn[];

  return {
    changesMessageName: `${toPascalCase(input.tableName)}Changes`,
    fields: columns.map((column, index) => ({
      fieldNumber: index + 1,
      name: column.name,
      protobufType: buildProtobufScalarType(column),
    })),
    requestFieldNumber: input.tableIndex + 4,
    rowMessageName: `${toPascalCase(input.tableName)}Row`,
    wrapperFieldNumbers: {
      changedRows: 1,
      deletedIds: 2,
    },
  };
}

function buildProtobufTables(
  contract: SyncContract
): Record<string, ProtobufTableDescriptor> {
  return Object.fromEntries(
    contract.tablesMeta.map((tableMeta, index) => {
      const protobufTable = buildProtobufTableDescriptor({
        table: contract.tables[index]!,
        tableIndex: index,
        tableName: tableMeta.tableName,
      });
      return [tableMeta.tableName, protobufTable];
    })
  );
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function formatWorkspaceFiles(pathsToFormat: string[]): void {
  const biomeConfig = findBiomeConfig(process.cwd());
  if (!biomeConfig) {
    return;
  }

  const result = spawnSync(
    "bun",
    ["x", "ultracite", "fix", "--config-path", biomeConfig, ...pathsToFormat],
    {
      stdio: "inherit",
    }
  );

  if (result.status !== 0) {
    throw new Error("Failed to format generated protobuf workspace files");
  }
}

function findBiomeConfig(startDir: string): string | null {
  let currentDir = startDir;

  while (true) {
    for (const candidateName of ["biome.jsonc", "biome.json", "biome.json5"]) {
      const candidatePath = path.join(currentDir, candidateName);
      if (fs.existsSync(candidatePath)) {
        return candidatePath;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

function renderProtoFieldType(type: ProtobufScalarType): string {
  return type;
}

function renderProtoFieldLine(
  field: ProtobufTableDescriptor["fields"][number]
): string {
  return `  ${renderProtoFieldType(field.protobufType)} ${field.name} = ${field.fieldNumber};`;
}

function renderProtoRowMessage(table: ProtobufTableDescriptor): string {
  const lines = [`message ${table.rowMessageName} {`];
  const fields = [...table.fields].sort(
    (a, b) => a.fieldNumber - b.fieldNumber
  );

  for (const field of fields) {
    lines.push(renderProtoFieldLine(field));
  }

  lines.push("}", "");
  return lines.join("\n");
}

function renderProtoChangesMessage(table: ProtobufTableDescriptor): string {
  return [
    `message ${table.changesMessageName} {`,
    `  repeated ${table.rowMessageName} changed_rows = ${table.wrapperFieldNumbers.changedRows};`,
    `  repeated string deleted_ids = ${table.wrapperFieldNumbers.deletedIds};`,
    "}",
    "",
  ].join("\n");
}

function renderProtoAckMessage(): string {
  return [
    "message SyncTableAck {",
    "  string table = 1;",
    "  repeated string accepted_created_ids = 2;",
    "  repeated string accepted_updated_ids = 3;",
    "  repeated string accepted_deleted_ids = 4;",
    "  repeated SyncRejectedRow rejected = 5;",
    "}",
    "",
    "message SyncRejectedRow {",
    "  string id = 1;",
    "  string reason = 2;",
    "}",
    "",
  ].join("\n");
}

function renderProtoEnvelopeMessages(
  _contract: SyncContract,
  tableOrder: SyncTableOrder,
  tables: Record<string, ProtobufTableDescriptor>
): string {
  const upsertTables = tableOrder.upsertOrder;
  const tableFields = upsertTables
    .map((tableName) => {
      const table = tables[tableName];
      if (!table) {
        return null;
      }
      return `  ${table.changesMessageName} ${tableName} = ${table.requestFieldNumber};`;
    })
    .filter((line): line is string => line !== null);

  return [
    "message SyncPushBatchRequest {",
    "  string scope_id = 1;",
    "  string client_id = 2;",
    "  string idempotency_key = 3;",
    ...tableFields,
    "}",
    "",
    "message SyncPushBatchResponse {",
    "  repeated SyncTableAck tables = 1;",
    "  string server_time = 2;",
    "}",
    "",
    "message SyncPullBatchRequest {",
    "  string scope_id = 1;",
    "  repeated string tables = 2;",
    "  string cursor = 3;",
    "  int64 limit = 4;",
    "}",
    "",
    "message SyncPullBatchResponse {",
    "  bool has_more = 1;",
    "  string cursor = 2;",
    "  string server_time = 3;",
    ...tableFields,
    "}",
    "",
    "message SyncStatusRequest {",
    "  string scope_id = 1;",
    "  string cursor = 2;",
    "}",
    "",
    "message SyncStatusResponse {",
    "  repeated string changed_tables = 1;",
    "  bool has_changes = 2;",
    "  string cursor = 3;",
    "  string server_time = 4;",
    "}",
    "",
  ].join("\n");
}

function renderTsFieldEntry(
  field: ProtobufTableDescriptor["fields"][number]
): string {
  return [
    "        {",
    `          fieldNumber: ${field.fieldNumber},`,
    `          name: ${JSON.stringify(field.name)},`,
    `          protobufType: ${JSON.stringify(field.protobufType)},`,
    "        },",
  ].join("\n");
}

function renderTsTableSection(
  tableName: string,
  table: ProtobufTableDescriptor
): string {
  const fields = [...table.fields].sort(
    (a, b) => a.fieldNumber - b.fieldNumber
  );
  const lines = [
    `    ${tableName}: {`,
    `      changesMessageName: ${JSON.stringify(table.changesMessageName)},`,
    "      fields: [",
    ...fields.map(renderTsFieldEntry),
    "      ],",
    `      requestFieldNumber: ${table.requestFieldNumber},`,
    `      rowMessageName: ${JSON.stringify(table.rowMessageName)},`,
    "      wrapperFieldNumbers: {",
    `        changedRows: ${table.wrapperFieldNumbers.changedRows},`,
    `        deletedIds: ${table.wrapperFieldNumbers.deletedIds},`,
    "      },",
    "    },",
  ];

  return lines.join("\n");
}

function renderProto(
  contract: SyncContract,
  tableOrder: SyncTableOrder
): string {
  const tables = buildProtobufTables(contract);
  const lines = [
    'syntax = "proto3";',
    "",
    `package ${contract.packageName};`,
    "",
    renderProtoAckMessage(),
    ...Object.values(tables).map((table) => renderProtoRowMessage(table)),
    ...Object.values(tables).map((table) => renderProtoChangesMessage(table)),
    renderProtoEnvelopeMessages(contract, tableOrder, tables),
  ];

  return `${lines.join("\n").trimEnd()}\n`;
}

function renderTsRuntime(
  contract: SyncContract,
  tableOrder: SyncTableOrder
): string {
  const tables = buildProtobufTables(contract);
  const lines = [
    "// Auto-generated by baresync. Do not edit manually.",
    "",
    "export const SYNC_PROTOBUF_SCHEMA = {",
    `  packageName: ${JSON.stringify(contract.packageName)},`,
    "  tableOrder: {",
    `    delete: ${renderInlineStringArray(tableOrder.deleteOrder)},`,
    `    upsert: ${renderInlineStringArray(tableOrder.upsertOrder)},`,
    "  },",
    "  tables: {",
  ];

  for (const [tableName, table] of Object.entries(tables)) {
    lines.push(renderTsTableSection(tableName, table));
  }

  lines.push("  },");
  lines.push("} as const;", "");
  return lines.join("\n");
}

function renderInlineStringArray(values: readonly string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}

function renderTsRuntimeWrapper(): string {
  return [
    "// Auto-generated by baresync. Do not edit manually.",
    "",
    "export {",
    "  decodeProtobufBody,",
    "  encodeProtobufBody,",
    "  type SyncProtobufSchema,",
    '} from "./runtime";',
    'export { SYNC_PROTOBUF_SCHEMA } from "./sync.generated";',
    "",
  ].join("\n");
}

function renderRuntimeSource(): string {
  return fs.readFileSync(RUNTIME_TEMPLATE_PATH, "utf-8");
}

function renderRustType(type: ProtobufScalarType): string {
  if (type === "bool") {
    return "bool";
  }
  if (type === "bytes") {
    return "Vec<u8>";
  }
  if (type === "double") {
    return "f64";
  }
  if (type === "int64") {
    return "i64";
  }
  return "String";
}

function renderRustField(
  field: ProtobufTableDescriptor["fields"][number]
): string {
  const prostType =
    field.protobufType === "bytes" ? "bytes" : field.protobufType;
  const rustName = field.name.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);

  return [
    `    #[prost(${prostType}, tag="${field.fieldNumber}")]`,
    `    pub ${rustName}: ${renderRustType(field.protobufType)},`,
  ].join("\n");
}

function renderRustRowStruct(table: ProtobufTableDescriptor): string {
  const lines = [
    "#[derive(Clone, PartialEq, ::prost::Message)]",
    `pub struct ${table.rowMessageName} {`,
  ];

  for (const field of [...table.fields].sort(
    (a, b) => a.fieldNumber - b.fieldNumber
  )) {
    lines.push(renderRustField(field));
  }

  lines.push("}", "");
  return lines.join("\n");
}

function renderRustChangesStruct(table: ProtobufTableDescriptor): string {
  return [
    "#[derive(Clone, PartialEq, ::prost::Message)]",
    `pub struct ${table.changesMessageName} {`,
    `    #[prost(message, repeated, tag="${table.wrapperFieldNumbers.changedRows}")]`,
    `    pub changed_rows: ::std::vec::Vec<${table.rowMessageName}>,`,
    `    #[prost(string, repeated, tag="${table.wrapperFieldNumbers.deletedIds}")]`,
    "    pub deleted_ids: ::std::vec::Vec<::std::string::String>,",
    "}",
    "",
  ].join("\n");
}

function renderRustAckStruct(): string {
  return [
    "#[derive(Clone, PartialEq, ::prost::Message)]",
    "pub struct SyncRejectedRow {",
    '    #[prost(string, tag="1")]',
    "    pub id: ::std::string::String,",
    '    #[prost(string, tag="2")]',
    "    pub reason: ::std::string::String,",
    "}",
    "",
    "#[derive(Clone, PartialEq, ::prost::Message)]",
    "pub struct SyncTableAck {",
    '    #[prost(string, tag="1")]',
    "    pub table: ::std::string::String,",
    '    #[prost(string, repeated, tag="2")]',
    "    pub accepted_created_ids: ::std::vec::Vec<::std::string::String>,",
    '    #[prost(string, repeated, tag="3")]',
    "    pub accepted_updated_ids: ::std::vec::Vec<::std::string::String>,",
    '    #[prost(string, repeated, tag="4")]',
    "    pub accepted_deleted_ids: ::std::vec::Vec<::std::string::String>,",
    '    #[prost(message, repeated, tag="5")]',
    "    pub rejected: ::std::vec::Vec<SyncRejectedRow>,",
    "}",
    "",
  ].join("\n");
}

function renderRustEnvelopeField(
  tableName: string,
  table: ProtobufTableDescriptor
): string {
  return [
    `    #[prost(message, optional, tag="${table.requestFieldNumber}")]`,
    `    pub ${tableName}: ::core::option::Option<${table.changesMessageName}>,`,
  ].join("\n");
}

function renderRustEnvelopeStructs(
  _contract: SyncContract,
  tableOrder: SyncTableOrder,
  tables: Record<string, ProtobufTableDescriptor>
): string {
  const upsertFields = tableOrder.upsertOrder
    .map((tableName) => {
      const table = tables[tableName];
      if (!table) {
        return null;
      }
      return renderRustEnvelopeField(tableName, table);
    })
    .filter((part): part is string => part !== null);

  const pullFields = upsertFields;

  return [
    "#[derive(Clone, PartialEq, ::prost::Message)]",
    "pub struct SyncPushBatchRequest {",
    '    #[prost(string, tag="1")]',
    "    pub scope_id: ::std::string::String,",
    '    #[prost(string, tag="2")]',
    "    pub client_id: ::std::string::String,",
    '    #[prost(string, tag="3")]',
    "    pub idempotency_key: ::std::string::String,",
    ...upsertFields,
    "}",
    "",
    "#[derive(Clone, PartialEq, ::prost::Message)]",
    "pub struct SyncPushBatchResponse {",
    '    #[prost(message, repeated, tag="1")]',
    "    pub tables: ::std::vec::Vec<SyncTableAck>,",
    '    #[prost(string, tag="2")]',
    "    pub server_time: ::std::string::String,",
    "}",
    "",
    "#[derive(Clone, PartialEq, ::prost::Message)]",
    "pub struct SyncPullBatchRequest {",
    '    #[prost(string, tag="1")]',
    "    pub scope_id: ::std::string::String,",
    '    #[prost(string, repeated, tag="2")]',
    "    pub tables: ::std::vec::Vec<::std::string::String>,",
    '    #[prost(string, tag="3")]',
    "    pub cursor: ::std::string::String,",
    '    #[prost(int64, tag="4")]',
    "    pub limit: i64,",
    "}",
    "",
    "#[derive(Clone, PartialEq, ::prost::Message)]",
    "pub struct SyncPullBatchResponse {",
    '    #[prost(bool, tag="1")]',
    "    pub has_more: bool,",
    '    #[prost(string, tag="2")]',
    "    pub cursor: ::std::string::String,",
    '    #[prost(string, tag="3")]',
    "    pub server_time: ::std::string::String,",
    ...pullFields,
    "}",
    "",
    "#[derive(Clone, PartialEq, ::prost::Message)]",
    "pub struct SyncStatusRequest {",
    '    #[prost(string, tag="1")]',
    "    pub scope_id: ::std::string::String,",
    '    #[prost(string, tag="2")]',
    "    pub cursor: ::std::string::String,",
    "}",
    "",
    "#[derive(Clone, PartialEq, ::prost::Message)]",
    "pub struct SyncStatusResponse {",
    '    #[prost(string, repeated, tag="1")]',
    "    pub changed_tables: ::std::vec::Vec<::std::string::String>,",
    '    #[prost(bool, tag="2")]',
    "    pub has_changes: bool,",
    '    #[prost(string, tag="3")]',
    "    pub cursor: ::std::string::String,",
    '    #[prost(string, tag="4")]',
    "    pub server_time: ::std::string::String,",
    "}",
    "",
  ].join("\n");
}

function renderRustRuntime(
  contract: SyncContract,
  tableOrder: SyncTableOrder
): string {
  const tables = buildProtobufTables(contract);
  return [
    "// Auto-generated by baresync. Do not edit manually.",
    "",
    renderRustAckStruct(),
    ...Object.values(tables).map((table) => renderRustRowStruct(table)),
    ...Object.values(tables).map((table) => renderRustChangesStruct(table)),
    renderRustEnvelopeStructs(contract, tableOrder, tables),
  ].join("\n");
}

export function generateProtobufWorkspaceArtifacts(
  config: ProtobufWorkspaceConfig
): void {
  const schemaModule: Record<string, unknown> = {};
  for (const t of config.contract.tables) {
    const tableConfig = getTableConfig(t.table);
    schemaModule[tableConfig.name] = t.table;
  }

  const tableOrder = computeSyncTableOrder({
    schemaModule,
    syncedTableNames: config.contract.tablesMeta.map(
      (table) => table.tableName
    ),
  });

  writeSyncContractJson(config.contract, tableOrder, config.outputDir);
  writeTableOrderConstants(tableOrder, config.outputDir);
  writeManifest(config.contract, tableOrder, config.outputDir, [
    "sync-contract.json",
    "sync-contract.manifest.json",
    path.relative(config.outputDir, config.outputs.proto),
    path.relative(config.outputDir, config.outputs.runtimeSourceTs),
    path.relative(config.outputDir, config.outputs.runtimeTs),
    path.relative(config.outputDir, config.outputs.syncTs),
    path.relative(config.outputDir, config.outputs.rustSyncMappers),
    "sync-table-order.ts",
  ]);
  writeFile(config.outputs.proto, renderProto(config.contract, tableOrder));
  writeFile(config.outputs.runtimeSourceTs, renderRuntimeSource());
  writeFile(
    config.outputs.syncTs,
    renderTsRuntime(config.contract, tableOrder)
  );
  writeFile(config.outputs.runtimeTs, renderTsRuntimeWrapper());
  writeFile(
    config.outputs.rustSyncMappers,
    renderRustRuntime(config.contract, tableOrder)
  );
  formatWorkspaceFiles([
    path.join(config.outputDir, "sync-contract.json"),
    path.join(config.outputDir, "sync-contract.manifest.json"),
    path.join(config.outputDir, "sync-table-order.ts"),
    config.outputs.runtimeSourceTs,
    config.outputs.runtimeTs,
    config.outputs.syncTs,
    config.outputs.rustSyncMappers,
  ]);
}
