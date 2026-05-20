import {
  decodeProtobufBody,
  encodeProtobufBody,
  type SyncProtobufSchema,
} from "../generator/protobuf-runtime.js";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

export class SyncPayloadTooLargeError extends Error {
  constructor(
    readonly kind: "payload_too_large",
    message: string
  ) {
    super(message);
    this.name = "SyncPayloadTooLargeError";
  }
}

export interface SyncRequestKind {
  encoding: "json" | "protobuf";
  kind: "push" | "pull" | "status";
}

function parseJsonRequestBody(rawBody: Uint8Array): Record<string, unknown> {
  const text = new TextDecoder().decode(rawBody);
  const parsed = JSON.parse(text) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Request body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function requireFields(
  body: Record<string, unknown>,
  fields: readonly string[],
  label: string
): void {
  for (const field of fields) {
    if (!(field in body)) {
      throw new Error(`Missing required ${label} field: "${field}"`);
    }
  }
}

function validateSyncRequestBody(
  kind: SyncRequestKind["kind"],
  body: Record<string, unknown>
): void {
  switch (kind) {
    case "push":
      requireFields(
        body,
        ["scopeId", "clientId", "idempotencyKey", "tables"],
        "push"
      );
      return;
    case "pull":
      requireFields(body, ["scopeId", "tables", "cursor"], "pull");
      return;
    case "status":
      requireFields(body, ["scopeId", "cursor"], "status");
      return;
    default:
      throw new Error(`Unsupported sync request kind: ${kind}`);
  }
}

export async function computeSyncRequestHash(body: unknown): Promise<string> {
  let data: Uint8Array;
  if (body instanceof Uint8Array) {
    data = body;
  } else if (body instanceof ArrayBuffer) {
    data = new Uint8Array(body);
  } else if (ArrayBuffer.isView(body)) {
    data = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  } else if (typeof body === "string") {
    data = new TextEncoder().encode(body);
  } else {
    data = new TextEncoder().encode(JSON.stringify(body));
  }
  const hashInput = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength
  ) as ArrayBuffer;
  const hashBuffer = await crypto.subtle.digest("SHA-256", hashInput);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function decodeSyncRequest(input: {
  encoding: "json" | "protobuf";
  kind: "push" | "pull" | "status";
  request: Request;
  protobufSchema?: SyncProtobufSchema;
}) {
  const rawBody = new Uint8Array(await input.request.arrayBuffer());
  const body =
    input.encoding === "json"
      ? parseJsonRequestBody(rawBody)
      : decodeProtobufBody({
          bytes: rawBody,
          kind: input.kind,
          message: "request",
          schema: input.protobufSchema,
        });

  validateSyncRequestBody(input.kind, body);

  const requestHash = await computeSyncRequestHash(rawBody);
  return { body, rawBodyByteLength: rawBody.byteLength, requestHash };
}

export function encodeSyncResponse(input: {
  body: unknown;
  encoding: "json" | "protobuf";
  kind: "push" | "pull" | "status";
  protobufSchema?: SyncProtobufSchema;
}): Response {
  if (input.encoding === "protobuf") {
    const bytes = encodeProtobufBody({
      body: input.body as Record<string, unknown>,
      kind: input.kind,
      message: "response",
      schema: input.protobufSchema,
    });
    return new Response(toArrayBuffer(bytes), {
      headers: {
        "Content-Type": "application/x-protobuf",
      },
    });
  }

  return Response.json(input.body);
}

export function validatePushEnvelope(
  decoded: { body: Record<string, unknown>; rawBodyByteLength?: number },
  limits: { maxBytes: number; maxRows: number }
): void {
  const bodyBytes =
    decoded.rawBodyByteLength ??
    new TextEncoder().encode(JSON.stringify(decoded.body)).byteLength;
  if (bodyBytes > limits.maxBytes) {
    throw new SyncPayloadTooLargeError(
      "payload_too_large",
      `Push request body (${bodyBytes} bytes) exceeds maxBytes (${limits.maxBytes})`
    );
  }

  const tables = decoded.body.tables as Array<{
    changedRows?: unknown[];
    deletedIds?: unknown[];
  }>;
  let totalRows = 0;
  for (const table of tables ?? []) {
    totalRows +=
      (table.changedRows?.length ?? 0) + (table.deletedIds?.length ?? 0);
  }

  if (totalRows > limits.maxRows) {
    throw new SyncPayloadTooLargeError(
      "payload_too_large",
      `Push request rows (${totalRows}) exceeds maxRows (${limits.maxRows})`
    );
  }
}

export function orderPushChanges(input: {
  changes: Array<{
    table: string;
    changedRows: unknown[];
    deletedIds: string[];
  }>;
  order: readonly string[];
}): Array<{ table: string; changedRows: unknown[]; deletedIds: string[] }> {
  const orderSet = new Map(input.order.map((name, i) => [name, i]));
  const known: Array<{
    table: string;
    changedRows: unknown[];
    deletedIds: string[];
    _order: number;
  }> = [];
  const unknown: Array<{
    table: string;
    changedRows: unknown[];
    deletedIds: string[];
  }> = [];

  for (const change of input.changes) {
    const idx = orderSet.get(change.table);
    if (idx === undefined) {
      unknown.push(change);
    } else {
      known.push({ ...change, _order: idx });
    }
  }

  known.sort((a, b) => a._order - b._order);
  return [...known.map(({ _order, ...rest }) => rest), ...unknown];
}

export function parseSyncCursor(
  cursor: string
): { syncUpdatedAt: number; tableName: string; rowId: string } | null {
  if (!cursor) {
    return null;
  }
  const parts = cursor.split(":");
  if (parts[0] !== "sync" || parts.length !== 4) {
    throw new Error(
      `Invalid sync cursor format: "${cursor}". Expected "sync:timestamp:tableName:rowId".`
    );
  }
  const syncUpdatedAt = Number(parts[1]);
  if (!Number.isFinite(syncUpdatedAt)) {
    throw new Error(
      `Invalid sync cursor timestamp: "${parts[1]}" is not a number.`
    );
  }
  return { syncUpdatedAt, tableName: parts[2], rowId: parts[3] };
}

export function formatSyncCursor(input: {
  syncUpdatedAt: number;
  tableName: string;
  rowId: string;
}): string {
  return `sync:${input.syncUpdatedAt}:${input.tableName}:${input.rowId}`;
}

export function orderDeleteChanges(input: {
  changes: Array<{
    table: string;
    changedRows: unknown[];
    deletedIds: string[];
  }>;
  order: readonly string[];
}): Array<{ table: string; changedRows: unknown[]; deletedIds: string[] }> {
  const reversedOrder = [...input.order].reverse();
  return orderPushChanges({ changes: input.changes, order: reversedOrder });
}

export function mapSyncError(error: unknown): {
  code: string;
  message: string;
} {
  if (error instanceof SyncPayloadTooLargeError) {
    return { code: "sync_payload_too_large", message: error.message };
  }

  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    (error as { status: number }).status === 409
  ) {
    const conflictError = error as { status: number; message?: string };
    return {
      code: "sync_idempotency_conflict",
      message: conflictError.message ?? "Conflict",
    };
  }

  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status;
    if (status === 401) {
      return { code: "sync_unauthorized", message: "Authentication required" };
    }
    if (status === 413) {
      return {
        code: "sync_payload_too_large",
        message: "Payload exceeds limit",
      };
    }
    if (status === 403 || status === 404) {
      return { code: "sync_scope_invalid", message: "Invalid scope" };
    }
    if (status === 400) {
      return { code: "sync_cursor_invalid", message: "Bad request" };
    }
  }

  if (error instanceof TypeError) {
    return { code: "sync_network_error", message: error.message };
  }

  const message = error instanceof Error ? error.message : String(error);
  return { code: "sync_unknown", message };
}

export function countPushRows(body: Record<string, unknown>): number {
  const tables = body.tables as
    | Array<{ changedRows?: unknown[]; deletedIds?: unknown[] }>
    | undefined;
  if (!tables) {
    return 0;
  }
  let total = 0;
  for (const table of tables) {
    total += (table.changedRows?.length ?? 0) + (table.deletedIds?.length ?? 0);
  }
  return total;
}
