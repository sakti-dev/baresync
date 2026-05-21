import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTableConfig, type SQLiteColumn } from "drizzle-orm/sqlite-core";
import type { SyncContract } from "../schema/contract";
import { computeSyncTableOrder, type SyncTableOrder } from "./fk-order";
import { formatGeneratedArtifacts } from "./formatter";
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

function toCamelCase(input: string): string {
  const pascal = toPascalCase(input);
  return pascal ? pascal[0]!.toLowerCase() + pascal.slice(1) : "";
}

function toSnakeCase(input: string): string {
  const result = input.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
  return result.startsWith("_") ? result.slice(1) : result;
}

function columnNameAliases(input: string): string[] {
  return [...new Set([input, toCamelCase(input), toSnakeCase(input)])];
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
    localOnlyColumns: input.table.localOnlyColumns ?? [],
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: generated Rust transport assembly is intentionally long
function renderRustTransportSupport(
  _contract: SyncContract,
  tableOrder: SyncTableOrder,
  tables: Record<string, ProtobufTableDescriptor>
): string {
  const lines: string[] = [
    "use std::convert::TryFrom;",
    "use std::future::Future;",
    "use std::pin::Pin;",
    "use std::sync::Arc;",
    "",
    "use baresync_core::error::{classify_http_error, SyncError};",
    "use baresync_core::http::{SyncHttpTransport, SyncTransportFuture};",
    "use prost::Message;",
    "use serde_json::{json, Map, Number, Value};",
    "",
    'const PROTOBUF_CONTENT_TYPE: &str = "application/x-protobuf";',
    "",
    "fn box_transport<T>(future: T) -> SyncTransportFuture",
    "where",
    "    T: Future<Output = Result<Value, SyncError>> + Send + 'static,",
    "{",
    "    Box::pin(future) as Pin<Box<dyn Future<Output = Result<Value, SyncError>> + Send>>",
    "}",
    "",
    "fn as_object<'a>(row: &'a Value, table: &str) -> Result<&'a Map<String, Value>, SyncError> {",
    "    row.as_object().ok_or_else(|| {",
    '        SyncError::Encoding(format!("Row for {table} is not a JSON object"))',
    "    })",
    "}",
    "",
    "fn field_missing(table: &str, field: &str, expected: &str) -> SyncError {",
    "    SyncError::Encoding(format!(\"Row for {table} is missing or has invalid field '{field}' expected {expected}\"))",
    "}",
    "",
    "fn string_field(row: &Map<String, Value>, table: &str, field: &str) -> Result<String, SyncError> {",
    "    row.get(field)",
    "        .and_then(Value::as_str)",
    "        .map(std::string::ToString::to_string)",
    '        .ok_or_else(|| field_missing(table, field, "string"))',
    "}",
    "",
    "fn optional_string_field(row: &Map<String, Value>, table: &str, field: &str) -> Result<String, SyncError> {",
    "    match row.get(field) {",
    "        Some(Value::Null) | None => Ok(String::new()),",
    "        Some(Value::String(value)) => Ok(value.clone()),",
    '        Some(_) => Err(field_missing(table, field, "string")),',
    "    }",
    "}",
    "",
    "fn optional_bool_field(row: &Map<String, Value>, field: &str) -> Result<Option<bool>, SyncError> {",
    "    match row.get(field) {",
    "        Some(Value::Null) | None => Ok(None),",
    "        Some(Value::Bool(value)) => Ok(Some(*value)),",
    '        Some(_) => Err(field_missing("row", field, "bool")),',
    "    }",
    "}",
    "",
    "#[allow(dead_code)]",
    "fn bool_field(row: &Map<String, Value>, table: &str, field: &str) -> Result<bool, SyncError> {",
    "    row.get(field)",
    "        .and_then(Value::as_bool)",
    '        .ok_or_else(|| field_missing(table, field, "bool"))',
    "}",
    "",
    "fn i64_field(row: &Map<String, Value>, table: &str, field: &str) -> Result<i64, SyncError> {",
    '    let value = row.get(field).ok_or_else(|| field_missing(table, field, "int64"))?;',
    "    if let Some(v) = value.as_i64() {",
    "        return Ok(v);",
    "    }",
    "    if let Some(v) = value.as_u64() {",
    '        return i64::try_from(v).map_err(|_| field_missing(table, field, "int64"));',
    "    }",
    '    Err(field_missing(table, field, "int64"))',
    "}",
    "",
    "#[allow(dead_code)]",
    "fn optional_i64_field(row: &Map<String, Value>, field: &str) -> Result<Option<i64>, SyncError> {",
    "    match row.get(field) {",
    "        Some(Value::Null) | None => Ok(None),",
    '        Some(_) => i64_field(row, "row", field).map(Some),',
    "    }",
    "}",
    "",
    "#[allow(dead_code)]",
    "fn f64_field(row: &Map<String, Value>, table: &str, field: &str) -> Result<f64, SyncError> {",
    "    row.get(field)",
    "        .and_then(Value::as_f64)",
    '        .ok_or_else(|| field_missing(table, field, "double"))',
    "}",
    "",
    "#[allow(dead_code)]",
    "fn optional_f64_field(row: &Map<String, Value>, field: &str) -> Result<Option<f64>, SyncError> {",
    "    match row.get(field) {",
    "        Some(Value::Null) | None => Ok(None),",
    '        Some(_) => f64_field(row, "row", field).map(Some),',
    "    }",
    "}",
    "",
    "#[allow(dead_code)]",
    "fn bytes_field(row: &Map<String, Value>, table: &str, field: &str) -> Result<Vec<u8>, SyncError> {",
    '    let value = row.get(field).ok_or_else(|| field_missing(table, field, "bytes"))?;',
    "    match value {",
    "        Value::String(value) => Ok(value.as_bytes().to_vec()),",
    "        Value::Array(items) => {",
    "            let mut bytes = Vec::with_capacity(items.len());",
    "            for item in items {",
    '                let number = item.as_u64().ok_or_else(|| field_missing(table, field, "bytes"))?;',
    '                let byte = u8::try_from(number).map_err(|_| field_missing(table, field, "bytes"))?;',
    "                bytes.push(byte);",
    "            }",
    "            Ok(bytes)",
    "        }",
    '        _ => Err(field_missing(table, field, "bytes")),',
    "    }",
    "}",
    "",
    "#[allow(dead_code)]",
    "fn optional_bytes_field(row: &Map<String, Value>, field: &str) -> Result<Option<Vec<u8>>, SyncError> {",
    "    match row.get(field) {",
    "        Some(Value::Null) | None => Ok(None),",
    '        Some(_) => bytes_field(row, "row", field).map(Some),',
    "    }",
    "}",
    "",
    "#[allow(dead_code)]",
    "fn bytes_to_value(value: &[u8]) -> Value {",
    "    Value::Array(",
    "        value",
    "            .iter()",
    "            .map(|byte| Value::Number(Number::from(u64::from(*byte))))",
    "            .collect(),",
    "    )",
    "}",
    "",
    "fn string_array_field(row: &Map<String, Value>, table: &str, field: &str) -> Result<Vec<String>, SyncError> {",
    '    let value = row.get(field).ok_or_else(|| field_missing(table, field, "array"))?;',
    "    let Some(items) = value.as_array() else {",
    '        return Err(field_missing(table, field, "array"));',
    "    };",
    "    let mut values = Vec::with_capacity(items.len());",
    "    for item in items {",
    '        let item = item.as_str().ok_or_else(|| field_missing(table, field, "string"))?;',
    "        values.push(item.to_string());",
    "    }",
    "    Ok(values)",
    "}",
    "",
  ];

  for (const [tableName, table] of Object.entries(tables)) {
    const camelTableName = toCamelCase(tableName);
    const localOnlyFields = new Set(
      table.localOnlyColumns.flatMap(columnNameAliases)
    );
    const rowFields = [...table.fields].sort(
      (a, b) => a.fieldNumber - b.fieldNumber
    );

    lines.push(
      `fn ${camelTableName}_row_from_value(row: &Value) -> Result<${table.rowMessageName}, SyncError> {`
    );
    lines.push(`    let obj = as_object(row, ${JSON.stringify(tableName)})?;`);
    lines.push(`    Ok(${table.rowMessageName} {`);
    for (const field of rowFields) {
      const jsFieldName = toCamelCase(field.name);
      const isLocalOnly =
        localOnlyFields.has(field.name) || localOnlyFields.has(jsFieldName);
      let valueExpr = `string_field(obj, ${JSON.stringify(tableName)}, ${JSON.stringify(jsFieldName)})?`;
      if (field.protobufType === "bool") {
        valueExpr = `bool_field(obj, ${JSON.stringify(tableName)}, ${JSON.stringify(jsFieldName)})?`;
      } else if (field.protobufType === "double") {
        valueExpr = `f64_field(obj, ${JSON.stringify(tableName)}, ${JSON.stringify(jsFieldName)})?`;
      } else if (field.protobufType === "int64") {
        valueExpr = `i64_field(obj, ${JSON.stringify(tableName)}, ${JSON.stringify(jsFieldName)})?`;
      } else if (field.protobufType === "bytes") {
        valueExpr = `bytes_field(obj, ${JSON.stringify(tableName)}, ${JSON.stringify(jsFieldName)})?`;
      } else if (jsFieldName === "deletedAt") {
        valueExpr = `optional_string_field(obj, ${JSON.stringify(tableName)}, ${JSON.stringify(jsFieldName)})?`;
      }
      if (isLocalOnly) {
        if (field.protobufType === "bool") {
          valueExpr = `optional_bool_field(obj, ${JSON.stringify(jsFieldName)})?.unwrap_or(false)`;
        } else if (field.protobufType === "double") {
          valueExpr = `optional_f64_field(obj, ${JSON.stringify(jsFieldName)})?.unwrap_or(0.0)`;
        } else if (field.protobufType === "int64") {
          valueExpr = `optional_i64_field(obj, ${JSON.stringify(jsFieldName)})?.unwrap_or(0)`;
        } else if (field.protobufType === "bytes") {
          valueExpr = `optional_bytes_field(obj, ${JSON.stringify(jsFieldName)})?.unwrap_or_default()`;
        } else {
          valueExpr = `optional_string_field(obj, ${JSON.stringify(tableName)}, ${JSON.stringify(jsFieldName)})?`;
        }
      }
      lines.push(`        ${field.name}: ${valueExpr},`);
    }
    lines.push("    })");
    lines.push("}", "");

    lines.push(
      `fn ${camelTableName}_row_to_value(row: &${table.rowMessageName}) -> Value {`
    );
    lines.push("    json!({");
    for (const field of rowFields) {
      const jsFieldName = toCamelCase(field.name);
      let valueExpr = `row.${field.name}.clone()`;
      if (jsFieldName === "deletedAt") {
        valueExpr = `if row.${field.name}.is_empty() { Value::Null } else { Value::String(row.${field.name}.clone()) }`;
      } else if (field.protobufType === "bytes") {
        valueExpr = `bytes_to_value(&row.${field.name})`;
      } else if (
        field.protobufType === "bool" ||
        field.protobufType === "double" ||
        field.protobufType === "int64"
      ) {
        valueExpr = `row.${field.name}`;
      }
      lines.push(`        ${JSON.stringify(jsFieldName)}: ${valueExpr},`);
    }
    lines.push("    })");
    lines.push("}", "");

    lines.push(
      `fn ${camelTableName}_changes_from_value(table: &Value) -> Result<${table.changesMessageName}, SyncError> {`
    );
    lines.push(
      `    let obj = as_object(table, ${JSON.stringify(tableName)})?;`
    );
    lines.push(
      `    let changed_rows = obj.get("changedRows").and_then(Value::as_array).ok_or_else(|| field_missing(${JSON.stringify(tableName)}, "changedRows", "array"))?;`
    );
    lines.push(
      `    let deleted_ids = string_array_field(obj, ${JSON.stringify(tableName)}, "deletedIds")?;`
    );
    lines.push(`    Ok(${table.changesMessageName} {`);
    lines.push("        changed_rows: changed_rows");
    lines.push("            .iter()");
    lines.push(`            .map(${camelTableName}_row_from_value)`);
    lines.push("            .collect::<Result<Vec<_>, _>>()?,");
    lines.push("        deleted_ids,");
    lines.push("    })");
    lines.push("}", "");

    lines.push(
      `fn ${camelTableName}_changes_to_value(changes: &${table.changesMessageName}) -> Value {`
    );
    lines.push("    json!({");
    lines.push(`        "table": ${JSON.stringify(tableName)},`);
    lines.push(
      `        "changedRows": changes.changed_rows.iter().map(${camelTableName}_row_to_value).collect::<Vec<_>>(),`
    );
    lines.push('        "deletedIds": changes.deleted_ids.clone(),');
    lines.push("    })");
    lines.push("}", "");
  }

  lines.push("fn table_ack_to_value(ack: &SyncTableAck) -> Value {");
  lines.push("    json!({");
  lines.push('        "table": ack.table.clone(),');
  lines.push('        "acceptedCreatedIds": ack.accepted_created_ids.clone(),');
  lines.push('        "acceptedUpdatedIds": ack.accepted_updated_ids.clone(),');
  lines.push('        "acceptedDeletedIds": ack.accepted_deleted_ids.clone(),');
  lines.push('        "rejected": ack.rejected.iter().map(|row| json!({');
  lines.push('            "id": row.id.clone(),');
  lines.push('            "reason": row.reason.clone(),');
  lines.push("        })).collect::<Vec<_>>(),");
  lines.push("    })");
  lines.push("}", "");

  const pushCases = tableOrder.upsertOrder
    .map((tableName) => {
      if (!tables[tableName]) {
        return null;
      }
      const fnName = `${toCamelCase(tableName)}_changes_from_value`;
      return [
        `            "${tableName}" => {`,
        `                request.${tableName} = Some(${fnName}(table)?);`,
        "            }",
      ].join("\n");
    })
    .filter((value): value is string => value !== null);

  lines.push("#[derive(Debug, Clone)]");
  lines.push("pub struct GeneratedProtobufTransport {");
  lines.push("    client: reqwest::Client,");
  lines.push("}");
  lines.push("");
  lines.push("impl GeneratedProtobufTransport {");
  lines.push("    pub fn new() -> Self {");
  lines.push("        Self::default()");
  lines.push("    }");
  lines.push("}");
  lines.push("");
  lines.push("impl Default for GeneratedProtobufTransport {");
  lines.push("    fn default() -> Self {");
  lines.push("        Self {");
  lines.push("            client: reqwest::Client::new(),");
  lines.push("        }");
  lines.push("    }");
  lines.push("}");
  lines.push("");
  lines.push(
    "pub fn generated_protobuf_transport() -> Arc<dyn SyncHttpTransport> {"
  );
  lines.push("    Arc::new(GeneratedProtobufTransport::default())");
  lines.push("}");
  lines.push("");
  lines.push(
    "fn push_request_from_value(envelope: &Value) -> Result<SyncPushBatchRequest, SyncError> {"
  );
  lines.push('    let obj = as_object(envelope, "push request")?;');
  lines.push("    let mut request = SyncPushBatchRequest {");
  lines.push(
    '        scope_id: string_field(obj, "push request", "scopeId")?,'
  );
  lines.push(
    '        client_id: string_field(obj, "push request", "clientId")?,'
  );
  lines.push(
    '        idempotency_key: string_field(obj, "push request", "idempotencyKey")?,'
  );
  for (const tableName of tableOrder.upsertOrder) {
    if (!tables[tableName]) {
      continue;
    }
    lines.push(`        ${tableName}: None,`);
  }
  lines.push("    };");
  lines.push("    let tables = obj");
  lines.push('        .get("tables")');
  lines.push("        .and_then(Value::as_array)");
  lines.push(
    '        .ok_or_else(|| field_missing("push request", "tables", "array"))?;'
  );
  lines.push("    for table in tables {");
  lines.push('        let table_obj = as_object(table, "push table entry")?;');
  lines.push(
    '        let table_name = string_field(table_obj, "push table entry", "table")?;'
  );
  lines.push("        match table_name.as_str() {");
  for (const pushCase of pushCases) {
    lines.push(pushCase);
  }
  lines.push(
    "            other => return Err(SyncError::Encoding(format!(\"Unexpected table '{other}' in push request\"))),"
  );
  lines.push("        }");
  lines.push("    }");
  lines.push("    Ok(request)");
  lines.push("}", "");

  lines.push(
    "fn push_response_to_value(response: SyncPushBatchResponse) -> Value {"
  );
  lines.push("    json!({");
  lines.push(
    '        "tables": response.tables.iter().map(table_ack_to_value).collect::<Vec<_>>(),'
  );
  lines.push('        "serverTime": response.server_time.clone(),');
  lines.push("    })");
  lines.push("}", "");

  lines.push(
    "fn pull_request_from_value(body: &Value) -> Result<SyncPullBatchRequest, SyncError> {"
  );
  lines.push('    let obj = as_object(body, "pull request")?;');
  lines.push(
    '    let tables = string_array_field(obj, "pull request", "tables")?;'
  );
  lines.push("    Ok(SyncPullBatchRequest {");
  lines.push(
    '        scope_id: string_field(obj, "pull request", "scopeId")?,'
  );
  lines.push("        tables,");
  lines.push('        cursor: string_field(obj, "pull request", "cursor")?,');
  lines.push('        limit: i64_field(obj, "pull request", "limit")?,');
  lines.push("    })");
  lines.push("}", "");

  lines.push(
    "fn pull_response_to_value(response: SyncPullBatchResponse) -> Value {"
  );
  lines.push("    let mut tables = Vec::new();");
  for (const tableName of tableOrder.upsertOrder) {
    if (!tables[tableName]) {
      continue;
    }
    lines.push(`    if let Some(changes) = response.${tableName}.as_ref() {`);
    lines.push(
      `        tables.push(${toCamelCase(tableName)}_changes_to_value(changes));`
    );
    lines.push("    }");
  }
  lines.push("    json!({");
  lines.push('        "hasMore": response.has_more,');
  lines.push('        "cursor": response.cursor.clone(),');
  lines.push('        "serverTime": response.server_time.clone(),');
  lines.push('        "tables": tables,');
  lines.push("    })");
  lines.push("}", "");

  lines.push(
    "fn status_request_from_value(body: &Value) -> Result<SyncStatusRequest, SyncError> {"
  );
  lines.push('    let obj = as_object(body, "status request")?;');
  lines.push("    Ok(SyncStatusRequest {");
  lines.push(
    '        scope_id: string_field(obj, "status request", "scopeId")?,'
  );
  lines.push('        cursor: string_field(obj, "status request", "cursor")?,');
  lines.push("    })");
  lines.push("}", "");

  lines.push(
    "fn status_response_to_value(response: SyncStatusResponse) -> Value {"
  );
  lines.push("    json!({");
  lines.push('        "changedTables": response.changed_tables.clone(),');
  lines.push('        "hasChanges": response.has_changes,');
  lines.push('        "cursor": response.cursor.clone(),');
  lines.push('        "serverTime": response.server_time.clone(),');
  lines.push("    })");
  lines.push("}", "");

  lines.push("impl SyncHttpTransport for GeneratedProtobufTransport {");
  lines.push(
    "    fn send_push_request(&self, api_url: String, envelope: Value) -> SyncTransportFuture {"
  );
  lines.push("        let client = self.client.clone();");
  lines.push("        box_transport(async move {");
  lines.push(
    "            let url = format!(\"{}/sync/push\", api_url.trim_end_matches('/'));"
  );
  lines.push("            let request = push_request_from_value(&envelope)?;");
  lines.push("            let body = request.encode_to_vec();");
  lines.push("            let response = client");
  lines.push("                .post(url)");
  lines.push('                .header("Content-Type", PROTOBUF_CONTENT_TYPE)');
  lines.push("                .body(body)");
  lines.push("                .send()");
  lines.push("                .await");
  lines.push(
    '                .map_err(|e| SyncError::Network(format!("Push request failed: {e}")))?;'
  );
  lines.push("            let status = response.status();");
  lines.push("            let bytes = response");
  lines.push("                .bytes()");
  lines.push("                .await");
  lines.push(
    '                .map_err(|e| SyncError::Network(format!("Failed to read response body: {e}")))?;'
  );
  lines.push("            if !status.is_success() {");
  lines.push("                let body = String::from_utf8_lossy(&bytes);");
  lines.push(
    "                return Err(classify_http_error(status.as_u16(), &body));"
  );
  lines.push("            }");
  lines.push(
    "            let decoded = SyncPushBatchResponse::decode(bytes.as_ref())"
  );
  lines.push(
    '                .map_err(|e| SyncError::Encoding(format!("Failed to decode protobuf push response: {e}")))?;'
  );
  lines.push("            Ok(push_response_to_value(decoded))");
  lines.push("        })");
  lines.push("    }");
  lines.push("");
  lines.push(
    "    fn send_status_request(&self, api_url: String, body: Value) -> SyncTransportFuture {"
  );
  lines.push("        let client = self.client.clone();");
  lines.push("        box_transport(async move {");
  lines.push(
    "            let url = format!(\"{}/sync/status\", api_url.trim_end_matches('/'));"
  );
  lines.push("            let request = status_request_from_value(&body)?;");
  lines.push("            let body = request.encode_to_vec();");
  lines.push("            let response = client");
  lines.push("                .post(url)");
  lines.push('                .header("Content-Type", PROTOBUF_CONTENT_TYPE)');
  lines.push("                .body(body)");
  lines.push("                .send()");
  lines.push("                .await");
  lines.push(
    '                .map_err(|e| SyncError::Network(format!("Status request failed: {e}")))?;'
  );
  lines.push("            let status = response.status();");
  lines.push("            let bytes = response");
  lines.push("                .bytes()");
  lines.push("                .await");
  lines.push(
    '                .map_err(|e| SyncError::Network(format!("Failed to read response body: {e}")))?;'
  );
  lines.push("            if !status.is_success() {");
  lines.push("                let body = String::from_utf8_lossy(&bytes);");
  lines.push(
    "                return Err(classify_http_error(status.as_u16(), &body));"
  );
  lines.push("            }");
  lines.push(
    "            let decoded = SyncStatusResponse::decode(bytes.as_ref())"
  );
  lines.push(
    '                .map_err(|e| SyncError::Encoding(format!("Failed to decode protobuf status response: {e}")))?;'
  );
  lines.push("            Ok(status_response_to_value(decoded))");
  lines.push("        })");
  lines.push("    }");
  lines.push("");
  lines.push(
    "    fn send_pull_request(&self, api_url: String, body: Value) -> SyncTransportFuture {"
  );
  lines.push("        let client = self.client.clone();");
  lines.push("        box_transport(async move {");
  lines.push(
    "            let url = format!(\"{}/sync/pull\", api_url.trim_end_matches('/'));"
  );
  lines.push("            let request = pull_request_from_value(&body)?;");
  lines.push("            let body = request.encode_to_vec();");
  lines.push("            let response = client");
  lines.push("                .post(url)");
  lines.push('                .header("Content-Type", PROTOBUF_CONTENT_TYPE)');
  lines.push("                .body(body)");
  lines.push("                .send()");
  lines.push("                .await");
  lines.push(
    '                .map_err(|e| SyncError::Network(format!("Pull request failed: {e}")))?;'
  );
  lines.push("            let status = response.status();");
  lines.push("            let bytes = response");
  lines.push("                .bytes()");
  lines.push("                .await");
  lines.push(
    '                .map_err(|e| SyncError::Network(format!("Failed to read response body: {e}")))?;'
  );
  lines.push("            if !status.is_success() {");
  lines.push("                let body = String::from_utf8_lossy(&bytes);");
  lines.push(
    "                return Err(classify_http_error(status.as_u16(), &body));"
  );
  lines.push("            }");
  lines.push(
    "            let decoded = SyncPullBatchResponse::decode(bytes.as_ref())"
  );
  lines.push(
    '                .map_err(|e| SyncError::Encoding(format!("Failed to decode protobuf pull response: {e}")))?;'
  );
  lines.push("            Ok(pull_response_to_value(decoded))");
  lines.push("        })");
  lines.push("    }");
  lines.push("}");

  return `${lines.join("\n").trimEnd()}\n`;
}

function renderRustRuntime(
  contract: SyncContract,
  tableOrder: SyncTableOrder
): string {
  const tables = buildProtobufTables(contract);
  return [
    "// Auto-generated by baresync. Do not edit manually.",
    "",
    renderRustTransportSupport(contract, tableOrder, tables),
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
  formatGeneratedArtifacts({
    projectDir: process.cwd(),
    rust: [config.outputs.rustSyncMappers],
    tsAndJson: [
      path.join(config.outputDir, "sync-contract.json"),
      path.join(config.outputDir, "sync-contract.manifest.json"),
      path.join(config.outputDir, "sync-table-order.ts"),
      config.outputs.runtimeSourceTs,
      config.outputs.runtimeTs,
      config.outputs.syncTs,
    ],
  });
}
