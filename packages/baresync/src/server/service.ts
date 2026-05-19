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

  return { body: obj, requestHash: "" };
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
