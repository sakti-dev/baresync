import { describe, expect, it } from "vitest";
import { ConflictRequestError } from "../idempotency";
import {
  countPushRows,
  formatSyncCursor,
  mapSyncError,
  orderDeleteChanges,
  parseSyncCursor,
  SyncPayloadTooLargeError,
} from "../service";

describe("parseSyncCursor", () => {
  it("parses a valid cursor", () => {
    const result = parseSyncCursor("sync:1234567890:users:abc-123");
    expect(result).toEqual({
      syncUpdatedAt: 1_234_567_890,
      tableName: "users",
      rowId: "abc-123",
    });
  });

  it("returns null for empty string", () => {
    expect(parseSyncCursor("")).toBeNull();
  });

  it("throws for invalid cursor format", () => {
    expect(() => parseSyncCursor("invalid")).toThrow(
      "Invalid sync cursor format"
    );
  });

  it("throws for non-numeric timestamp", () => {
    expect(() => parseSyncCursor("sync:notanumber:users:abc")).toThrow(
      "Invalid sync cursor timestamp"
    );
  });
});

describe("formatSyncCursor", () => {
  it("formats cursor correctly", () => {
    const result = formatSyncCursor({
      syncUpdatedAt: 1_234_567_890,
      tableName: "users",
      rowId: "abc-123",
    });
    expect(result).toBe("sync:1234567890:users:abc-123");
  });
});

describe("cursor roundtrip", () => {
  it("format then parse recovers original values", () => {
    const original = { syncUpdatedAt: 999, tableName: "orders", rowId: "xyz" };
    const formatted = formatSyncCursor(original);
    const parsed = parseSyncCursor(formatted);
    expect(parsed).toEqual(original);
  });
});

describe("orderDeleteChanges", () => {
  it("reverses the upsert order (children before parents)", () => {
    const changes = [
      { table: "users", changedRows: [] as unknown[], deletedIds: ["u1"] },
      { table: "orders", changedRows: [] as unknown[], deletedIds: ["o1"] },
      { table: "items", changedRows: [] as unknown[], deletedIds: ["i1"] },
    ];
    const order = ["users", "orders", "items"];
    const result = orderDeleteChanges({ changes, order });
    const tables = result.map((c) => c.table);
    expect(tables).toEqual(["items", "orders", "users"]);
  });

  it("places unknown tables last", () => {
    const changes = [
      { table: "users", changedRows: [] as unknown[], deletedIds: ["u1"] },
      {
        table: "unknown_table",
        changedRows: [] as unknown[],
        deletedIds: ["x1"],
      },
      { table: "orders", changedRows: [] as unknown[], deletedIds: ["o1"] },
    ];
    const order = ["users", "orders"];
    const result = orderDeleteChanges({ changes, order });
    const tables = result.map((c) => c.table);
    expect(tables).toEqual(["orders", "users", "unknown_table"]);
  });
});

describe("mapSyncError", () => {
  it("maps SyncPayloadTooLargeError to sync_payload_too_large", () => {
    const error = new SyncPayloadTooLargeError("payload_too_large", "too big");
    const result = mapSyncError(error);
    expect(result.code).toBe("sync_payload_too_large");
    expect(result.message).toBe("too big");
  });

  it("maps ConflictRequestError to sync_idempotency_conflict", () => {
    const error = new ConflictRequestError("already in progress");
    const result = mapSyncError(error);
    expect(result.code).toBe("sync_idempotency_conflict");
    expect(result.message).toBe("already in progress");
  });

  it("maps HTTP 413 to sync_payload_too_large", () => {
    const error = Object.assign(new Error("payload limit"), { status: 413 });
    const result = mapSyncError(error);
    expect(result.code).toBe("sync_payload_too_large");
  });

  it("maps HTTP 401 to sync_unauthorized", () => {
    const error = Object.assign(new Error("no auth"), { status: 401 });
    const result = mapSyncError(error);
    expect(result.code).toBe("sync_unauthorized");
  });

  it("maps HTTP 403 to sync_scope_invalid", () => {
    const error = Object.assign(new Error("forbidden"), { status: 403 });
    const result = mapSyncError(error);
    expect(result.code).toBe("sync_scope_invalid");
  });

  it("maps HTTP 404 to sync_scope_invalid", () => {
    const error = Object.assign(new Error("not found"), { status: 404 });
    const result = mapSyncError(error);
    expect(result.code).toBe("sync_scope_invalid");
  });

  it("maps HTTP 400 to sync_cursor_invalid", () => {
    const error = Object.assign(new Error("bad request"), { status: 400 });
    const result = mapSyncError(error);
    expect(result.code).toBe("sync_cursor_invalid");
  });

  it("maps TypeError to sync_network_error", () => {
    const error = new TypeError("fetch failed");
    const result = mapSyncError(error);
    expect(result.code).toBe("sync_network_error");
    expect(result.message).toBe("fetch failed");
  });

  it("maps unknown error to sync_unknown", () => {
    const result = mapSyncError("something went wrong");
    expect(result.code).toBe("sync_unknown");
    expect(result.message).toBe("something went wrong");
  });
});

describe("countPushRows", () => {
  it("counts rows across multiple tables", () => {
    const body = {
      tables: [
        { changedRows: [1, 2, 3], deletedIds: ["a"] },
        { changedRows: [4], deletedIds: ["b", "c"] },
      ],
    };
    expect(countPushRows(body)).toBe(7);
  });

  it("returns 0 for body with no tables", () => {
    expect(countPushRows({})).toBe(0);
  });

  it("returns 0 for empty tables array", () => {
    expect(countPushRows({ tables: [] })).toBe(0);
  });
});
