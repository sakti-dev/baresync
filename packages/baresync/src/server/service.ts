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
  encoding: "json";
  kind: "push" | "pull";
}

export async function computeSyncRequestHash(body: unknown): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(body));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function decodeSyncRequest(input: {
  encoding: "json";
  kind: "push" | "pull";
  request: { json(): Promise<unknown> };
}) {
  const body = await input.request.json();

  if (typeof body !== "object" || body === null) {
    throw new Error("Request body must be a JSON object");
  }

  const obj = body as Record<string, unknown>;

  if (input.kind === "push") {
    for (const field of ["scopeId", "clientId", "idempotencyKey", "tables"]) {
      if (!(field in obj)) {
        throw new Error(`Missing required push field: "${field}"`);
      }
    }
  }

  if (input.kind === "pull") {
    for (const field of ["scopeId", "tables", "cursor"]) {
      if (!(field in obj)) {
        throw new Error(`Missing required pull field: "${field}"`);
      }
    }
  }

  const requestHash = await computeSyncRequestHash(obj);
  return { body: obj, requestHash };
}

export function encodeSyncResponse(input: {
  body: unknown;
  encoding: "json";
  kind: "push" | "pull";
}): Response {
  return Response.json(input.body);
}

export function validatePushEnvelope(
  decoded: { body: Record<string, unknown> },
  limits: { maxBytes: number; maxRows: number }
): void {
  const bodyStr = JSON.stringify(decoded.body);
  if (bodyStr.length > limits.maxBytes) {
    throw new SyncPayloadTooLargeError(
      "payload_too_large",
      `Push request body (${bodyStr.length} bytes) exceeds maxBytes (${limits.maxBytes})`
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
