import { describe, expect, it } from "vitest";
import { ConflictRequestError } from "../idempotency";
import {
  buildPullTables,
  changedTableNames,
  countPushRows,
  formatLatestSyncCursor,
  formatSyncCursor,
  formatSyncWatermarkCursor,
  mapSyncError,
  orderDeleteChanges,
  parseSyncCursor,
  parseSyncCursorTimestamp,
  pickLatestSyncCursorRow,
  SyncPayloadTooLargeError,
  splitSyncRows,
  validateSyncTable,
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

describe("parseSyncCursorTimestamp", () => {
  it("returns zero for empty cursor", () => {
    expect(parseSyncCursorTimestamp("")).toBe(0);
  });

  it("returns the timestamp from a valid cursor", () => {
    expect(parseSyncCursorTimestamp("sync:1700000000:items:item-1")).toBe(
      1_700_000_000
    );
  });

  it("throws for invalid cursor format", () => {
    expect(() => parseSyncCursorTimestamp("invalid")).toThrow(
      "Invalid sync cursor format"
    );
  });
});

describe("splitSyncRows", () => {
  it("splits changed and deleted rows", () => {
    const result = splitSyncRows([
      {
        deletedAt: null,
        id: "item-1",
        name: "Widget",
        syncUpdatedAt: 123,
      },
      {
        deletedAt: "2026-05-21T00:00:00.000Z",
        id: "item-2",
        name: "Gadget",
        syncUpdatedAt: 124,
      },
    ]);

    expect(result.changedRows).toEqual([
      {
        deletedAt: null,
        id: "item-1",
        name: "Widget",
      },
    ]);
    expect(result.deletedIds).toEqual(["item-2"]);
  });
});

describe("buildPullTables", () => {
  const allTables = ["locations", "items", "stock_counts"] as const;
  const changes = {
    items: {
      changedRows: [{ id: "item-1" }],
      deletedIds: ["item-2"],
    },
    locations: {
      changedRows: [{ id: "location-1" }],
      deletedIds: [],
    },
    stock_counts: {
      changedRows: [],
      deletedIds: [],
    },
  };

  it("returns all known tables when requested list is empty", () => {
    const result = buildPullTables({
      allTables,
      changes,
      requestedTables: [],
    });

    expect(result.map((table) => table.table)).toEqual(allTables);
  });

  it("filters requested tables and ignores unknown names", () => {
    const result = buildPullTables({
      allTables,
      changes,
      requestedTables: ["items", "unknown", "locations"],
    });

    expect(result.map((table) => table.table)).toEqual(["items", "locations"]);
  });
});

describe("changedTableNames", () => {
  it("returns only tables with changed rows or deleted ids", () => {
    const result = changedTableNames({
      allTables: ["locations", "items", "stock_counts"] as const,
      changes: {
        items: {
          changedRows: [{ id: "item-1" }],
          deletedIds: [],
        },
        locations: {
          changedRows: [],
          deletedIds: [],
        },
        stock_counts: {
          changedRows: [],
          deletedIds: ["stock-1"],
        },
      },
    });

    expect(result).toEqual(["items", "stock_counts"]);
  });
});

describe("validateSyncTable", () => {
  it("returns a known table name", () => {
    const result = validateSyncTable("items", ["locations", "items"] as const);
    expect(result).toBe("items");
  });

  it("throws for unknown table names", () => {
    expect(() =>
      validateSyncTable("unknown", ["locations", "items"] as const)
    ).toThrow('Unsupported sync table: "unknown"');
  });
});

describe("formatLatestSyncCursor", () => {
  it("formats the latest cursor row", () => {
    expect(
      formatLatestSyncCursor({
        id: "item-1",
        syncUpdatedAt: 1_700_000_000,
        tableName: "items",
      })
    ).toBe("sync:1700000000:items:item-1");
  });
});

describe("pickLatestSyncCursorRow", () => {
  it("sorts by syncUpdatedAt then updatedAt then id", () => {
    const older = {
      id: "b",
      syncUpdatedAt: 10,
      updatedAt: "2026-05-20T00:00:00.000Z",
    };
    const newerBySync = {
      id: "a",
      syncUpdatedAt: 11,
      updatedAt: "2026-05-19T00:00:00.000Z",
    };
    const newerByUpdatedAt = {
      id: "c",
      syncUpdatedAt: 10,
      updatedAt: "2026-05-21T00:00:00.000Z",
    };
    const newerById = {
      id: "d",
      syncUpdatedAt: 10,
      updatedAt: "2026-05-20T00:00:00.000Z",
    };

    expect(
      pickLatestSyncCursorRow([older, newerBySync, newerByUpdatedAt, newerById])
    ).toEqual(newerBySync);
    expect(pickLatestSyncCursorRow([])).toBeNull();
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

describe("formatSyncWatermarkCursor", () => {
  it("formats a synthetic server watermark cursor", () => {
    expect(formatSyncWatermarkCursor(1_780_915_200_000)).toBe(
      "sync:1780915200000:__watermark__:__scope__"
    );
  });
});

describe("watermark cursor roundtrip", () => {
  it("parses a synthetic watermark cursor", () => {
    const result = parseSyncCursor(
      "sync:1780915200000:__watermark__:__scope__"
    );
    expect(result).toMatchObject({
      syncUpdatedAt: 1_780_915_200_000,
      tableName: "__watermark__",
      rowId: "__scope__",
    });
  });
});
