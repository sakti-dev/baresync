import { describe, expect, it } from "vitest";
import { chunkArray, getWriteChunkSize } from "../chunking";
import {
  decodeSyncRequest,
  encodeSyncResponse,
  orderPushChanges,
  SyncPayloadTooLargeError,
  validatePushEnvelope,
} from "../service";

describe("chunking", () => {
  it("respects bind parameter budget", () => {
    expect(getWriteChunkSize({ columnCount: 10 })).toBe(500);
  });

  it("clamps to bind limit for wide tables", () => {
    expect(getWriteChunkSize({ columnCount: 100 })).toBe(300);
  });

  it("chunkArray splits correctly", () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe("decodeSyncRequest", () => {
  it("decodes valid JSON push request", async () => {
    const body = {
      scopeId: "s1",
      clientId: "c1",
      idempotencyKey: "key1",
      tables: [],
    };
    const result = await decodeSyncRequest({
      encoding: "json",
      kind: "push",
      request: { json: async () => body },
    });
    expect(result.body.scopeId).toBe("s1");
  });

  it("throws on missing push field", async () => {
    await expect(
      decodeSyncRequest({
        encoding: "json",
        kind: "push",
        request: { json: async () => ({ scopeId: "s1" }) },
      })
    ).rejects.toThrow('Missing required push field: "clientId"');
  });
});

describe("encodeSyncResponse", () => {
  it("returns JSON response with correct content type", () => {
    const response = encodeSyncResponse({
      body: { serverTime: "2026-01-01" },
      encoding: "json",
      kind: "push",
    });
    expect(response.headers.get("Content-Type")).toContain("application/json");
  });
});

describe("validatePushEnvelope", () => {
  it("passes valid envelope", () => {
    validatePushEnvelope(
      {
        body: {
          scopeId: "s1",
          tables: [{ changedRows: [1, 2], deletedIds: [] }],
        },
      },
      { maxBytes: 1024 * 1024, maxRows: 2000 }
    );
  });

  it("rejects oversized envelope", () => {
    expect(() =>
      validatePushEnvelope(
        { body: { tables: [], big: "x".repeat(2000) } },
        { maxBytes: 100, maxRows: 2000 }
      )
    ).toThrow(SyncPayloadTooLargeError);
  });

  it("rejects too many rows", () => {
    expect(() =>
      validatePushEnvelope(
        {
          body: {
            tables: [{ changedRows: new Array(100).fill({}), deletedIds: [] }],
          },
        },
        { maxBytes: 1024 * 1024, maxRows: 50 }
      )
    ).toThrow(SyncPayloadTooLargeError);
  });
});

describe("orderPushChanges", () => {
  it("reorders changes to match FK order", () => {
    const result = orderPushChanges({
      changes: [
        { table: "products", changedRows: [], deletedIds: [] },
        { table: "categories", changedRows: [], deletedIds: [] },
      ],
      order: ["categories", "products"] as const,
    });
    expect(result.map((c) => c.table)).toEqual(["categories", "products"]);
  });

  it("places unknown tables last", () => {
    const result = orderPushChanges({
      changes: [
        { table: "unknown", changedRows: [], deletedIds: [] },
        { table: "products", changedRows: [], deletedIds: [] },
      ],
      order: ["categories", "products"] as const,
    });
    expect(result.map((c) => c.table)).toEqual(["products", "unknown"]);
  });
});
