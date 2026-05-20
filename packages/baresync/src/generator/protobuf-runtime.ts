export type ProtobufScalarType =
  | "bool"
  | "bytes"
  | "double"
  | "int64"
  | "string";

export interface ProtobufFieldDescriptor {
  fieldNumber: number;
  name: string;
  protobufType: ProtobufScalarType;
}

export interface ProtobufTableDescriptor {
  changesMessageName: string;
  fields: ProtobufFieldDescriptor[];
  requestFieldNumber: number;
  rowMessageName: string;
  wrapperFieldNumbers: {
    changedRows: number;
    deletedIds: number;
  };
}

const SNAKE_TO_CAMEL_RE = /_([a-z0-9])/g;

export interface SyncProtobufSchema {
  packageName: string;
  tableOrder?: { delete: string[]; upsert: string[] };
  tables: Record<string, ProtobufTableDescriptor>;
}

export interface SyncTableAck {
  acceptedCreatedIds: string[];
  acceptedDeletedIds: string[];
  acceptedUpdatedIds: string[];
  rejected: Array<{ id: string; reason: string }>;
  table: string;
}

interface SyncTableChanges {
  changedRows: Record<string, unknown>[];
  deletedIds: string[];
  table: string;
}

interface SyncRuntime {
  tableEntries: Array<{
    descriptor: ProtobufTableDescriptor;
    tableName: string;
  }>;
  tableOrder: string[];
}

class BinaryWriter {
  private readonly bytes: number[] = [];

  finish(): Uint8Array {
    return new Uint8Array(this.bytes);
  }

  writeBool(fieldNumber: number, value: boolean): void {
    this.writeTag(fieldNumber, 0);
    this.writeVarint(value ? 1 : 0);
  }

  writeBytes(fieldNumber: number, value: Uint8Array): void {
    this.writeTag(fieldNumber, 2);
    this.writeVarint(value.byteLength);
    this.writeRaw(value);
  }

  writeDouble(fieldNumber: number, value: number): void {
    this.writeTag(fieldNumber, 1);
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setFloat64(0, value, true);
    this.writeRaw(new Uint8Array(buffer));
  }

  writeInt64(fieldNumber: number, value: bigint | number): void {
    this.writeTag(fieldNumber, 0);
    this.writeVarint(value);
  }

  writeMessage(fieldNumber: number, value: Uint8Array): void {
    this.writeTag(fieldNumber, 2);
    this.writeVarint(value.byteLength);
    this.writeRaw(value);
  }

  writeString(fieldNumber: number, value: string): void {
    this.writeBytes(fieldNumber, new TextEncoder().encode(value));
  }

  private writeRaw(value: Uint8Array): void {
    for (const byte of value) {
      this.bytes.push(byte);
    }
  }

  private writeTag(fieldNumber: number, wireType: number): void {
    this.writeVarint(fieldNumber * 8 + wireType);
  }

  private writeVarint(value: bigint | number): void {
    let remaining =
      typeof value === "bigint" ? value : BigInt(Math.trunc(value));

    if (remaining < 0n) {
      throw new Error("Negative protobuf varints are not supported");
    }

    while (remaining >= 0x80n) {
      this.bytes.push(Number((remaining % 0x80n) + 0x80n));
      remaining /= 0x80n;
    }

    this.bytes.push(Number(remaining));
  }
}

class BinaryReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  eof(): boolean {
    return this.offset >= this.bytes.byteLength;
  }

  readTag(): { fieldNumber: number; wireType: number } | null {
    if (this.eof()) {
      return null;
    }

    const tag = this.readVarint();
    return {
      fieldNumber: Number(tag / 8n),
      wireType: Number(tag % 8n),
    };
  }

  readBool(): boolean {
    return this.readVarint() !== 0n;
  }

  readBytes(): Uint8Array {
    const length = Number(this.readVarint());
    const start = this.offset;
    const end = start + length;
    this.offset = end;
    return this.bytes.slice(start, end);
  }

  readDouble(): number {
    const start = this.offset;
    const end = start + 8;
    const value = new DataView(
      this.bytes.buffer,
      this.bytes.byteOffset + start,
      8
    ).getFloat64(0, true);
    this.offset = end;
    return value;
  }

  readInt64(): number {
    return Number(this.readVarint());
  }

  readString(): string {
    return new TextDecoder().decode(this.readBytes());
  }

  skip(wireType: number): void {
    if (wireType === 0) {
      this.readVarint();
      return;
    }

    if (wireType === 1) {
      this.offset += 8;
      return;
    }

    if (wireType === 2) {
      const length = Number(this.readVarint());
      this.offset += length;
      return;
    }

    if (wireType === 5) {
      this.offset += 4;
      return;
    }

    throw new Error(`Unsupported protobuf wire type: ${wireType}`);
  }

  private readVarint(): bigint {
    let shift = 0n;
    let result = 0n;

    while (true) {
      if (this.eof()) {
        throw new Error("Unexpected end of protobuf buffer");
      }

      const byte = this.bytes[this.offset++];
      result += BigInt(byte % 0x80) * 2n ** shift;

      if (byte < 0x80) {
        return result;
      }

      shift += 7n;
    }
  }
}

function camelToSnake(value: string): string {
  return value.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

function snakeToCamel(value: string): string {
  return value.replace(SNAKE_TO_CAMEL_RE, (_, char: string) =>
    char.toUpperCase()
  );
}

function toJsFieldName(fieldName: string): string {
  return fieldName.includes("_") ? snakeToCamel(fieldName) : fieldName;
}

function resolveFieldValue(
  row: Record<string, unknown>,
  fieldName: string
): unknown {
  if (Object.hasOwn(row, fieldName)) {
    return row[fieldName];
  }

  const camelName = toJsFieldName(fieldName);
  if (Object.hasOwn(row, camelName)) {
    return row[camelName];
  }

  const snakeName = camelToSnake(fieldName);
  if (Object.hasOwn(row, snakeName)) {
    return row[snakeName];
  }
}

function getRuntime(schema?: SyncProtobufSchema): SyncRuntime | null {
  if (!schema) {
    return null;
  }

  const tableEntries = Object.entries(schema.tables).map(
    ([tableName, descriptor]) => ({
      descriptor,
      tableName,
    })
  );
  return {
    tableEntries,
    tableOrder:
      schema.tableOrder?.upsert ?? tableEntries.map((entry) => entry.tableName),
  };
}

function encodeScalar(
  writer: BinaryWriter,
  field: ProtobufFieldDescriptor,
  value: unknown
): void {
  if (value === undefined || value === null) {
    return;
  }

  if (field.protobufType === "string") {
    writer.writeString(field.fieldNumber, String(value));
    return;
  }

  if (field.protobufType === "bool") {
    writer.writeBool(field.fieldNumber, Boolean(value));
    return;
  }

  if (field.protobufType === "double") {
    writer.writeDouble(field.fieldNumber, Number(value));
    return;
  }

  if (field.protobufType === "int64") {
    writer.writeInt64(
      field.fieldNumber,
      typeof value === "bigint" ? value : BigInt(Math.trunc(Number(value)))
    );
    return;
  }

  if (field.protobufType === "bytes") {
    if (value instanceof Uint8Array) {
      writer.writeBytes(field.fieldNumber, value);
      return;
    }
    if (typeof value === "string") {
      writer.writeBytes(field.fieldNumber, new TextEncoder().encode(value));
      return;
    }
    throw new Error(`Unsupported bytes value for field "${field.name}"`);
  }
}

function decodeScalar(
  reader: BinaryReader,
  protobufType: ProtobufScalarType
): unknown {
  if (protobufType === "string") {
    return reader.readString();
  }
  if (protobufType === "bool") {
    return reader.readBool();
  }
  if (protobufType === "double") {
    return reader.readDouble();
  }
  if (protobufType === "int64") {
    return reader.readInt64();
  }
  return reader.readBytes();
}

function encodeRowMessage(
  row: Record<string, unknown>,
  fields: ProtobufFieldDescriptor[]
): Uint8Array {
  const writer = new BinaryWriter();
  const orderedFields = [...fields].sort(
    (a, b) => a.fieldNumber - b.fieldNumber
  );

  for (const field of orderedFields) {
    encodeScalar(writer, field, resolveFieldValue(row, field.name));
  }

  return writer.finish();
}

function decodeRowMessage(
  bytes: Uint8Array,
  fields: ProtobufFieldDescriptor[]
): Record<string, unknown> {
  const reader = new BinaryReader(bytes);
  const fieldMap = new Map(fields.map((field) => [field.fieldNumber, field]));
  const row: Record<string, unknown> = {};

  while (!reader.eof()) {
    const tag = reader.readTag();
    if (!tag) {
      break;
    }

    const field = fieldMap.get(tag.fieldNumber);
    if (!field) {
      reader.skip(tag.wireType);
      continue;
    }

    const value = decodeScalar(reader, field.protobufType);
    row[toJsFieldName(field.name)] = value;
  }

  return row;
}

function encodeChangesMessage(
  changes: SyncTableChanges,
  table: ProtobufTableDescriptor
): Uint8Array {
  const writer = new BinaryWriter();
  for (const row of changes.changedRows) {
    writer.writeMessage(
      table.wrapperFieldNumbers.changedRows,
      encodeRowMessage(row, table.fields)
    );
  }
  for (const id of changes.deletedIds) {
    writer.writeString(table.wrapperFieldNumbers.deletedIds, id);
  }
  return writer.finish();
}

function decodeChangesMessage(
  bytes: Uint8Array,
  tableName: string,
  table: ProtobufTableDescriptor
): SyncTableChanges {
  const reader = new BinaryReader(bytes);
  const changedRows: Record<string, unknown>[] = [];
  const deletedIds: string[] = [];

  while (!reader.eof()) {
    const tag = reader.readTag();
    if (!tag) {
      break;
    }

    if (tag.fieldNumber === table.wrapperFieldNumbers.changedRows) {
      changedRows.push(decodeRowMessage(reader.readBytes(), table.fields));
      continue;
    }

    if (tag.fieldNumber === table.wrapperFieldNumbers.deletedIds) {
      deletedIds.push(reader.readString());
      continue;
    }

    reader.skip(tag.wireType);
  }

  return {
    changedRows,
    deletedIds,
    table: tableName,
  };
}

function encodeAckMessage(ack: SyncTableAck): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeString(1, ack.table);
  for (const id of ack.acceptedCreatedIds) {
    writer.writeString(2, id);
  }
  for (const id of ack.acceptedUpdatedIds) {
    writer.writeString(3, id);
  }
  for (const id of ack.acceptedDeletedIds) {
    writer.writeString(4, id);
  }
  for (const rejected of ack.rejected) {
    const nested = new BinaryWriter();
    nested.writeString(1, rejected.id);
    nested.writeString(2, rejected.reason);
    writer.writeMessage(5, nested.finish());
  }
  return writer.finish();
}

function decodeAckMessage(bytes: Uint8Array): SyncTableAck {
  const reader = new BinaryReader(bytes);
  const rejected: Array<{ id: string; reason: string }> = [];
  const ack: SyncTableAck = {
    acceptedCreatedIds: [],
    acceptedDeletedIds: [],
    acceptedUpdatedIds: [],
    rejected,
    table: "",
  };

  while (!reader.eof()) {
    const tag = reader.readTag();
    if (!tag) {
      break;
    }

    switch (tag.fieldNumber) {
      case 1:
        ack.table = reader.readString();
        break;
      case 2:
        ack.acceptedCreatedIds.push(reader.readString());
        break;
      case 3:
        ack.acceptedUpdatedIds.push(reader.readString());
        break;
      case 4:
        ack.acceptedDeletedIds.push(reader.readString());
        break;
      case 5:
        rejected.push(decodeAckRejection(reader.readBytes()));
        break;
      default:
        reader.skip(tag.wireType);
        break;
    }
  }

  return ack;
}

function decodeAckRejection(bytes: Uint8Array): { id: string; reason: string } {
  const nested = new BinaryReader(bytes);
  const row = { id: "", reason: "" };

  while (!nested.eof()) {
    const nestedTag = nested.readTag();
    if (!nestedTag) {
      break;
    }

    switch (nestedTag.fieldNumber) {
      case 1:
        row.id = nested.readString();
        break;
      case 2:
        row.reason = nested.readString();
        break;
      default:
        nested.skip(nestedTag.wireType);
        break;
    }
  }

  return row;
}

function orderTables(
  schema: SyncProtobufSchema,
  tables: Array<{ table: string }>
): string[] {
  const order = schema.tableOrder?.upsert ?? Object.keys(schema.tables);
  const rank = new Map(order.map((name, index) => [name, index]));
  return [...tables]
    .sort((a, b) => {
      const aRank = rank.get(a.table) ?? Number.MAX_SAFE_INTEGER;
      const bRank = rank.get(b.table) ?? Number.MAX_SAFE_INTEGER;
      return aRank - bRank;
    })
    .map((table) => table.table);
}

function encodePushRequest(
  schema: SyncProtobufSchema,
  body: Record<string, unknown>
): Uint8Array {
  const runtime = getRuntime(schema);
  if (!runtime) {
    throw new Error("Protobuf schema is required for push requests");
  }

  const writer = new BinaryWriter();
  writer.writeString(1, String(body.scopeId ?? ""));
  writer.writeString(2, String(body.clientId ?? ""));
  writer.writeString(3, String(body.idempotencyKey ?? ""));

  const tables = Array.isArray(body.tables) ? body.tables : [];
  const tableNames = orderTables(
    schema,
    tables.filter(
      (table): table is { table: string } =>
        typeof table === "object" &&
        table !== null &&
        typeof (table as { table?: unknown }).table === "string"
    )
  );

  for (const tableName of tableNames) {
    const change = tables.find(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        (entry as { table?: unknown }).table === tableName
    ) as Record<string, unknown> | undefined;
    const tableDescriptor = schema.tables[tableName];
    if (!(tableDescriptor && change)) {
      continue;
    }
    writer.writeMessage(
      tableDescriptor.requestFieldNumber,
      encodeChangesMessage(
        {
          changedRows: Array.isArray(change.changedRows)
            ? (change.changedRows as Record<string, unknown>[])
            : [],
          deletedIds: Array.isArray(change.deletedIds)
            ? change.deletedIds.map(String)
            : [],
          table: tableName,
        },
        tableDescriptor
      )
    );
  }

  return writer.finish();
}

function decodePushRequest(
  schema: SyncProtobufSchema,
  bytes: Uint8Array
): Record<string, unknown> {
  const reader = new BinaryReader(bytes);
  const tables: SyncTableChanges[] = [];
  const tableEntries = Object.entries(schema.tables);
  const fieldToTable = new Map(
    tableEntries.map(([tableName, table]) => [
      table.requestFieldNumber,
      { table, tableName },
    ])
  );
  const tableOrder =
    schema.tableOrder?.upsert ?? tableEntries.map(([tableName]) => tableName);
  const changesByName = new Map<string, SyncTableChanges>();
  let scopeId = "";
  let clientId = "";
  let idempotencyKey = "";

  while (!reader.eof()) {
    const tag = reader.readTag();
    if (!tag) {
      break;
    }

    if (tag.fieldNumber === 1) {
      scopeId = reader.readString();
      continue;
    }
    if (tag.fieldNumber === 2) {
      clientId = reader.readString();
      continue;
    }
    if (tag.fieldNumber === 3) {
      idempotencyKey = reader.readString();
      continue;
    }

    const table = fieldToTable.get(tag.fieldNumber);
    if (table && tag.wireType === 2) {
      const changes = decodeChangesMessage(
        reader.readBytes(),
        table.tableName,
        table.table
      );
      changesByName.set(changes.table, changes);
      continue;
    }

    reader.skip(tag.wireType);
  }

  for (const tableName of tableOrder) {
    const changes = changesByName.get(tableName);
    if (changes) {
      tables.push(changes);
    }
  }

  return {
    clientId,
    idempotencyKey,
    scopeId,
    tables,
  };
}

function encodePullRequest(body: Record<string, unknown>): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeString(1, String(body.scopeId ?? ""));
  for (const table of Array.isArray(body.tables) ? body.tables : []) {
    writer.writeString(2, String(table));
  }
  writer.writeString(3, String(body.cursor ?? ""));
  writer.writeInt64(
    4,
    typeof body.limit === "number" ? Math.trunc(body.limit) : 0
  );
  return writer.finish();
}

function decodePullRequest(bytes: Uint8Array): Record<string, unknown> {
  const reader = new BinaryReader(bytes);
  const tables: string[] = [];
  let scopeId = "";
  let cursor = "";
  let limit = 0;

  while (!reader.eof()) {
    const tag = reader.readTag();
    if (!tag) {
      break;
    }

    if (tag.fieldNumber === 1) {
      scopeId = reader.readString();
      continue;
    }
    if (tag.fieldNumber === 2) {
      tables.push(reader.readString());
      continue;
    }
    if (tag.fieldNumber === 3) {
      cursor = reader.readString();
      continue;
    }
    if (tag.fieldNumber === 4) {
      limit = reader.readInt64();
      continue;
    }

    reader.skip(tag.wireType);
  }

  return { cursor, limit, scopeId, tables };
}

function encodePushResponse(body: Record<string, unknown>): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeString(2, String(body.serverTime ?? ""));
  const tables = Array.isArray(body.tables) ? body.tables : [];
  for (const table of tables) {
    const ack = table as SyncTableAck;
    writer.writeMessage(1, encodeAckMessage(ack));
  }
  return writer.finish();
}

function decodePushResponse(bytes: Uint8Array): Record<string, unknown> {
  const reader = new BinaryReader(bytes);
  const tables: SyncTableAck[] = [];
  let serverTime = "";

  while (!reader.eof()) {
    const tag = reader.readTag();
    if (!tag) {
      break;
    }
    if (tag.fieldNumber === 1) {
      tables.push(decodeAckMessage(reader.readBytes()));
      continue;
    }
    if (tag.fieldNumber === 2) {
      serverTime = reader.readString();
      continue;
    }
    reader.skip(tag.wireType);
  }

  return { serverTime, tables };
}

function encodePullResponse(
  schema: SyncProtobufSchema,
  body: Record<string, unknown>
): Uint8Array {
  const runtime = getRuntime(schema);
  if (!runtime) {
    throw new Error("Protobuf schema is required for pull responses");
  }

  const writer = new BinaryWriter();
  writer.writeBool(1, Boolean(body.hasMore));
  writer.writeString(2, String(body.cursor ?? ""));
  writer.writeString(3, String(body.serverTime ?? ""));

  const tables = Array.isArray(body.tables) ? body.tables : [];
  const tableOrder = runtime.tableOrder;

  for (const tableName of tableOrder) {
    const tableDescriptor = schema.tables[tableName];
    const change = tables.find(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        (entry as { table?: unknown }).table === tableName
    ) as Record<string, unknown> | undefined;
    if (!(tableDescriptor && change)) {
      continue;
    }

    writer.writeMessage(
      tableDescriptor.requestFieldNumber,
      encodeChangesMessage(
        {
          changedRows: Array.isArray(change.changedRows)
            ? (change.changedRows as Record<string, unknown>[])
            : [],
          deletedIds: Array.isArray(change.deletedIds)
            ? change.deletedIds.map(String)
            : [],
          table: tableName,
        },
        tableDescriptor
      )
    );
  }

  return writer.finish();
}

function decodePullResponse(
  schema: SyncProtobufSchema,
  bytes: Uint8Array
): Record<string, unknown> {
  const reader = new BinaryReader(bytes);
  const tableEntries = Object.entries(schema.tables);
  const fieldToTable = new Map(
    tableEntries.map(([tableName, table]) => [
      table.requestFieldNumber,
      { table, tableName },
    ])
  );
  const tableOrder =
    schema.tableOrder?.upsert ?? tableEntries.map(([tableName]) => tableName);
  const changesByName = new Map<string, SyncTableChanges>();
  let cursor = "";
  let hasMore = false;
  let serverTime = "";

  while (!reader.eof()) {
    const tag = reader.readTag();
    if (!tag) {
      break;
    }

    if (tag.fieldNumber === 1) {
      hasMore = reader.readBool();
      continue;
    }
    if (tag.fieldNumber === 2) {
      cursor = reader.readString();
      continue;
    }
    if (tag.fieldNumber === 3) {
      serverTime = reader.readString();
      continue;
    }

    const table = fieldToTable.get(tag.fieldNumber);
    if (table && tag.wireType === 2) {
      const changes = decodeChangesMessage(
        reader.readBytes(),
        table.tableName,
        table.table
      );
      changesByName.set(changes.table, changes);
      continue;
    }

    reader.skip(tag.wireType);
  }

  const tables: SyncTableChanges[] = [];
  for (const tableName of tableOrder) {
    const changes = changesByName.get(tableName);
    if (changes) {
      tables.push(changes);
    }
  }

  return { cursor, hasMore, serverTime, tables };
}

function encodeStatusRequest(body: Record<string, unknown>): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeString(1, String(body.scopeId ?? ""));
  writer.writeString(2, String(body.cursor ?? ""));
  return writer.finish();
}

function decodeStatusRequest(bytes: Uint8Array): Record<string, unknown> {
  const reader = new BinaryReader(bytes);
  let scopeId = "";
  let cursor = "";
  while (!reader.eof()) {
    const tag = reader.readTag();
    if (!tag) {
      break;
    }
    if (tag.fieldNumber === 1) {
      scopeId = reader.readString();
      continue;
    }
    if (tag.fieldNumber === 2) {
      cursor = reader.readString();
      continue;
    }
    reader.skip(tag.wireType);
  }
  return { cursor, scopeId };
}

function encodeStatusResponse(body: Record<string, unknown>): Uint8Array {
  const writer = new BinaryWriter();
  const changedTables = Array.isArray(body.changedTables)
    ? body.changedTables
    : [];
  for (const table of changedTables) {
    writer.writeString(1, String(table));
  }
  writer.writeBool(2, Boolean(body.hasChanges));
  writer.writeString(3, String(body.cursor ?? ""));
  writer.writeString(4, String(body.serverTime ?? ""));
  return writer.finish();
}

function decodeStatusResponse(bytes: Uint8Array): Record<string, unknown> {
  const reader = new BinaryReader(bytes);
  const changedTables: string[] = [];
  let cursor = "";
  let hasChanges = false;
  let serverTime = "";

  while (!reader.eof()) {
    const tag = reader.readTag();
    if (!tag) {
      break;
    }

    if (tag.fieldNumber === 1) {
      changedTables.push(reader.readString());
      continue;
    }
    if (tag.fieldNumber === 2) {
      hasChanges = reader.readBool();
      continue;
    }
    if (tag.fieldNumber === 3) {
      cursor = reader.readString();
      continue;
    }
    if (tag.fieldNumber === 4) {
      serverTime = reader.readString();
      continue;
    }

    reader.skip(tag.wireType);
  }

  return { changedTables, cursor, hasChanges, serverTime };
}

export function encodeProtobufBody(input: {
  body: Record<string, unknown>;
  kind: "pull" | "push" | "status";
  message: "request" | "response";
  schema?: SyncProtobufSchema;
}): Uint8Array {
  if (input.kind === "push" && input.message === "request") {
    if (!input.schema) {
      throw new Error("Protobuf schema is required for push requests");
    }
    return encodePushRequest(input.schema, input.body);
  }

  if (input.kind === "pull" && input.message === "request") {
    return encodePullRequest(input.body);
  }

  if (input.kind === "push" && input.message === "response") {
    return encodePushResponse(input.body);
  }

  if (input.kind === "pull" && input.message === "response") {
    if (!input.schema) {
      throw new Error("Protobuf schema is required for pull responses");
    }
    return encodePullResponse(input.schema, input.body);
  }

  if (input.kind === "status" && input.message === "request") {
    return encodeStatusRequest(input.body);
  }

  return encodeStatusResponse(input.body);
}

export function decodeProtobufBody(input: {
  bytes: Uint8Array;
  kind: "pull" | "push" | "status";
  message: "request" | "response";
  schema?: SyncProtobufSchema;
}): Record<string, unknown> {
  if (input.kind === "push" && input.message === "request") {
    if (!input.schema) {
      throw new Error("Protobuf schema is required for push requests");
    }
    return decodePushRequest(input.schema, input.bytes);
  }

  if (input.kind === "pull" && input.message === "request") {
    return decodePullRequest(input.bytes);
  }

  if (input.kind === "push" && input.message === "response") {
    return decodePushResponse(input.bytes);
  }

  if (input.kind === "pull" && input.message === "response") {
    if (!input.schema) {
      throw new Error("Protobuf schema is required for pull responses");
    }
    return decodePullResponse(input.schema, input.bytes);
  }

  if (input.kind === "status" && input.message === "request") {
    return decodeStatusRequest(input.bytes);
  }

  return decodeStatusResponse(input.bytes);
}
