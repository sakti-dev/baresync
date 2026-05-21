import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { describe, expect, it } from "vitest";
import {
  decodeProtobufBody,
  encodeProtobufBody,
  SYNC_PROTOBUF_SCHEMA,
  type SyncProtobufSchema,
} from "../../../../../tests/e2e/generated/protobuf/runtime.generated";
import { ConflictRequestError, createIdempotencyGuard } from "../idempotency";
import {
  countPushRows,
  decodeSyncRequest,
  encodeSyncResponse,
  orderPushChanges,
  parseSyncCursor,
  validatePushEnvelope,
} from "../service";
import {
  baselinePull,
  serverSoftDelete,
  serverWinsRejection,
} from "./fixtures";

const protobufSchema = SYNC_PROTOBUF_SCHEMA as unknown as SyncProtobufSchema;

interface TablePayload {
  changedRows: Record<string, unknown>[];
  deletedIds: string[];
  table: string;
}

function createTestDb(): SqliteRemoteDatabase {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE sync_batch_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      status TEXT NOT NULL,
      response_body TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      UNIQUE(client_id, idempotency_key)
    )
  `);
  return drizzle(sqlite) as unknown as SqliteRemoteDatabase;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

function createProtobufRequest(
  kind: "pull" | "push" | "status",
  body: Record<string, unknown>
): Request {
  const bytes = encodeProtobufBody({
    body,
    kind,
    message: "request",
    schema: protobufSchema,
  });

  return new Request("http://localhost/sync", {
    body: toArrayBuffer(bytes),
    headers: {
      "Content-Type": "application/x-protobuf",
    },
    method: "POST",
  });
}

async function decodeProtobufResponse<T>(
  response: Response,
  kind: "pull" | "push" | "status"
): Promise<T> {
  return decodeProtobufBody({
    bytes: new Uint8Array(await response.arrayBuffer()),
    kind,
    message: "response",
    schema: protobufSchema,
  }) as T;
}

function createReversedPushBody() {
  return {
    clientId: "client-protobuf-sim-1",
    idempotencyKey: "idem-protobuf-sim-1",
    scopeId: "merchant-1",
    tables: [
      {
        changedRows: [
          {
            categoryId: "cat-2",
            createdAt: "2026-05-20T00:00:00.000Z",
            deletedAt: null,
            id: "prod-2",
            isSynced: false,
            merchantId: "merchant-1",
            name: "Green Tea",
            priceMinorUnits: 12_000,
            syncUpdatedAt: 1_716_120_001_000,
            updatedAt: "2026-05-20T00:00:00.000Z",
          },
        ],
        deletedIds: ["prod-deleted-1"],
        table: "products",
      },
      {
        changedRows: [
          {
            createdAt: "2026-05-20T00:00:00.000Z",
            deletedAt: null,
            id: "cat-2",
            isSynced: true,
            merchantId: "merchant-1",
            name: "Tea",
            sortOrder: 2,
            syncUpdatedAt: 1_716_120_000_000,
            updatedAt: "2026-05-20T00:00:00.000Z",
          },
        ],
        deletedIds: ["cat-deleted-1"],
        table: "categories",
      },
    ],
  };
}

function normalizeGeneratedProtobufRows(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeGeneratedProtobufRows(entry));
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (key === "syncUpdatedAt") {
      continue;
    }
    if (key === "deletedAt" && nestedValue === null) {
      continue;
    }
    normalized[key] = normalizeGeneratedProtobufRows(nestedValue);
  }
  return normalized;
}

describe("protobuf simulation: push pipeline", () => {
  it("decodes, validates, reorders, deduplicates, and encodes push semantics", async () => {
    const db = createTestDb();
    const guard = createIdempotencyGuard({ db });
    const pushBody = createReversedPushBody();
    const decoded = await decodeSyncRequest({
      encoding: "protobuf",
      kind: "push",
      protobufSchema,
      request: createProtobufRequest("push", pushBody),
    });

    validatePushEnvelope(decoded, { maxBytes: 1024 * 1024, maxRows: 10 });
    expect(countPushRows(decoded.body)).toBe(4);

    const decodedTables = decoded.body.tables as TablePayload[];
    const ordered = orderPushChanges({
      changes: decodedTables,
      order: ["categories", "products"],
    }) as TablePayload[];
    expect(ordered.map((table) => table.table)).toEqual([
      "categories",
      "products",
    ]);
    expect(ordered[0].deletedIds).toEqual(["cat-deleted-1"]);
    expect(ordered[1].deletedIds).toEqual(["prod-deleted-1"]);

    const productRow = ordered[1].changedRows[0];
    expect(productRow).toEqual(
      expect.objectContaining({
        isSynced: false,
        priceMinorUnits: 12_000,
      })
    );
    expect(productRow).not.toHaveProperty("syncUpdatedAt");
    expect(productRow).not.toHaveProperty("deletedAt");

    let applyCount = 0;
    const runPush = () =>
      guard.run(
        {
          clientId: String(decoded.body.clientId),
          idempotencyKey: String(decoded.body.idempotencyKey),
          requestHash: decoded.requestHash,
        },
        () => {
          applyCount++;
          return Promise.resolve({
            serverTime: "2026-05-20T00:00:00.000Z",
            tables: ordered.map((table) => ({
              acceptedCreatedIds: table.changedRows.map((row) =>
                String(row.id)
              ),
              acceptedDeletedIds: table.deletedIds,
              acceptedUpdatedIds: [],
              rejected: [],
              table: table.table,
            })),
          });
        }
      );

    const first = await runPush();
    const second = await runPush();
    expect(first.wasReplay).toBe(false);
    expect(second.wasReplay).toBe(true);
    expect(applyCount).toBe(1);

    const response = encodeSyncResponse({
      body: second.result,
      encoding: "protobuf",
      kind: "push",
      protobufSchema,
    });
    expect(response.headers.get("Content-Type")).toBe("application/x-protobuf");
    await expect(decodeProtobufResponse(response, "push")).resolves.toEqual({
      serverTime: "2026-05-20T00:00:00.000Z",
      tables: [
        {
          acceptedCreatedIds: ["cat-2"],
          acceptedDeletedIds: ["cat-deleted-1"],
          acceptedUpdatedIds: [],
          rejected: [],
          table: "categories",
        },
        {
          acceptedCreatedIds: ["prod-2"],
          acceptedDeletedIds: ["prod-deleted-1"],
          acceptedUpdatedIds: [],
          rejected: [],
          table: "products",
        },
      ],
    });
  });

  it("rejects idempotency key reuse with a different protobuf request hash", async () => {
    const db = createTestDb();
    const guard = createIdempotencyGuard({ db });
    const firstBody = createReversedPushBody();
    const secondBody = {
      ...firstBody,
      tables: firstBody.tables.map((table) =>
        table.table === "categories"
          ? {
              ...table,
              changedRows: table.changedRows.map((row) => ({
                ...row,
                name: "Tea Edited",
              })),
            }
          : table
      ),
    };
    const firstDecoded = await decodeSyncRequest({
      encoding: "protobuf",
      kind: "push",
      protobufSchema,
      request: createProtobufRequest("push", firstBody),
    });
    const secondDecoded = await decodeSyncRequest({
      encoding: "protobuf",
      kind: "push",
      protobufSchema,
      request: createProtobufRequest("push", secondBody),
    });

    expect(firstDecoded.requestHash).not.toBe(secondDecoded.requestHash);

    await guard.run(
      {
        clientId: "client-protobuf-sim-1",
        idempotencyKey: "idem-protobuf-sim-1",
        requestHash: firstDecoded.requestHash,
      },
      async () => ({ serverTime: "2026-05-20T00:00:00.000Z", tables: [] })
    );

    await expect(
      guard.run(
        {
          clientId: "client-protobuf-sim-1",
          idempotencyKey: "idem-protobuf-sim-1",
          requestHash: secondDecoded.requestHash,
        },
        async () => ({ serverTime: "2026-05-20T00:00:01.000Z", tables: [] })
      )
    ).rejects.toThrow(ConflictRequestError);
  });
});

describe("protobuf simulation: pull and status responses", () => {
  it.each([
    ["baseline pull", baselinePull],
    ["server soft delete", serverSoftDelete],
    ["server-wins reconciliation", serverWinsRejection.reconciliationPull],
    [
      "paginated mixed pull",
      {
        cursor: "sync:1716120003000:products:prod-3",
        hasMore: true,
        serverTime: "2026-05-20T00:00:03.000Z",
        tables: [
          {
            changedRows: [
              {
                createdAt: "2026-05-20T00:00:00.000Z",
                deletedAt: null,
                id: "cat-3",
                isSynced: true,
                merchantId: "merchant-1",
                name: "Snacks",
                sortOrder: 3,
                syncUpdatedAt: 1_716_120_003_000,
                updatedAt: "2026-05-20T00:00:03.000Z",
              },
            ],
            deletedIds: ["cat-deleted-3"],
            table: "categories",
          },
          {
            changedRows: [],
            deletedIds: ["prod-deleted-3"],
            table: "products",
          },
        ],
      },
    ],
  ])("round-trips %s through protobuf", async (_name, body) => {
    const response = encodeSyncResponse({
      body,
      encoding: "protobuf",
      kind: "pull",
      protobufSchema,
    });

    const decoded = await decodeProtobufResponse<{
      cursor: string;
      hasMore: boolean;
      tables: TablePayload[];
    }>(response, "pull");

    expect(decoded).toEqual(normalizeGeneratedProtobufRows(body));
    expect(parseSyncCursor(decoded.cursor)).not.toBeNull();
    for (const table of decoded.tables) {
      for (const row of table.changedRows) {
        expect(typeof row).toBe("object");
        expect(row).not.toBeNull();
      }
    }
  });

  it("decodes status requests and encodes status responses with cursor semantics", async () => {
    const statusRequest = {
      cursor: "sync:1716120000000:categories:cat-1",
      scopeId: "merchant-1",
    };
    const decodedRequest = await decodeSyncRequest({
      encoding: "protobuf",
      kind: "status",
      protobufSchema,
      request: createProtobufRequest("status", statusRequest),
    });
    expect(decodedRequest.body).toEqual(statusRequest);
    expect(parseSyncCursor(String(decodedRequest.body.cursor))).toEqual({
      rowId: "cat-1",
      syncUpdatedAt: 1_716_120_000_000,
      tableName: "categories",
    });

    const responseBody = {
      changedTables: ["categories", "products"],
      cursor: "sync:1716120002000:products:prod-1",
      hasChanges: true,
      serverTime: "2026-05-20T00:00:02.000Z",
    };
    const response = encodeSyncResponse({
      body: responseBody,
      encoding: "protobuf",
      kind: "status",
      protobufSchema,
    });

    await expect(decodeProtobufResponse(response, "status")).resolves.toEqual(
      responseBody
    );
  });
});
