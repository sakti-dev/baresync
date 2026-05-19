import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import {
  decodeProtobufBody,
  encodeProtobufBody,
  type SyncProtobufSchema,
} from "../../../../../tests/e2e/generated/protobuf/runtime.generated";
import { generateSyncArtifacts } from "../../generator";
import { defineSyncContract } from "../../schema/contract";
import { defineSyncedTable } from "../../schema/synced-table";
import {
  computeSyncRequestHash,
  decodeSyncRequest,
  encodeSyncResponse,
} from "../service";

const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
  isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
});

const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id),
  name: text("name").notNull(),
  priceMinorUnits: integer("price_minor_units").notNull(),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  syncUpdatedAt: integer("sync_updated_at").notNull().default(0),
  isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
});

const categoriesSynced = defineSyncedTable({
  table: categories,
  scope: {
    source: "scope",
    field: "merchantId",
    column: categories.merchantId,
  },
  localOnlyColumns: ["isSynced"],
  conflict: { strategy: "last-write-wins", column: categories.updatedAt },
  delete: { mode: "soft", column: categories.deletedAt },
});

const productsSynced = defineSyncedTable({
  table: products,
  scope: {
    source: "scope",
    field: "merchantId",
    column: products.merchantId,
  },
  localOnlyColumns: ["isSynced"],
  conflict: { strategy: "last-write-wins", column: products.updatedAt },
  delete: { mode: "soft", column: products.deletedAt },
});

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/sync"
);

function loadFixture(name: string) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf-8"));
}

function createJsonRequest(body: unknown): Request {
  return new Request("http://localhost/sync", {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

function createProtobufRequest(bytes: Uint8Array): Request {
  const body = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  return new Request("http://localhost/sync", {
    body,
    headers: {
      "Content-Type": "application/x-protobuf",
    },
    method: "POST",
  });
}

function createProtobufSchema(): SyncProtobufSchema {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-proto-"));
  try {
    const contract = defineSyncContract({
      encoding: "protobuf",
      packageName: "test.sync.v1",
      tables: [categoriesSynced, productsSynced],
    });
    generateSyncArtifacts(contract, tmpDir);
    const parsed = JSON.parse(
      fs.readFileSync(path.join(tmpDir, "sync-contract.json"), "utf-8")
    ) as { protobuf: SyncProtobufSchema };
    return parsed.protobuf;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe("protobuf parity", () => {
  it("round-trips the canonical push fixture as typed protobuf rows", async () => {
    const schema = createProtobufSchema();
    const pushFixture = loadFixture("category-product-push.json");
    const requestBytes = encodeProtobufBody({
      body: pushFixture,
      kind: "push",
      message: "request",
      schema,
    });

    const jsonDecoded = await decodeSyncRequest({
      encoding: "json",
      kind: "push",
      request: createJsonRequest(pushFixture),
    });
    const protobufDecoded = await decodeSyncRequest({
      encoding: "protobuf",
      kind: "push",
      request: createProtobufRequest(requestBytes),
      protobufSchema: schema,
    });

    expect(protobufDecoded.body).toEqual(jsonDecoded.body);
    expect(protobufDecoded.requestHash).toBe(
      await computeSyncRequestHash(requestBytes)
    );

    const tables = protobufDecoded.body.tables as Array<{
      changedRows: unknown[];
      deletedIds: string[];
      table: string;
    }>;
    expect(tables[0].table).toBe("categories");
    expect(typeof tables[0].changedRows[0]).toBe("object");
    expect(tables[0].changedRows[0]).not.toBeNull();
    expect(typeof tables[0].changedRows[0]).not.toBe("string");
    expect(tables[1].changedRows[0]).toEqual(
      expect.objectContaining({
        categoryId: "cat-1",
        id: "prod-1",
        merchantId: "merchant-1",
      })
    );
  });

  it("round-trips the canonical pull fixture as a protobuf response", async () => {
    const schema = createProtobufSchema();
    const pullFixture = loadFixture("category-product-pull.json");

    const response = encodeSyncResponse({
      body: pullFixture,
      encoding: "protobuf",
      kind: "pull",
      protobufSchema: schema,
    });

    expect(response.headers.get("Content-Type")).toBe("application/x-protobuf");

    const decoded = decodeProtobufBody({
      bytes: new Uint8Array(await response.arrayBuffer()),
      kind: "pull",
      message: "response",
      schema,
    });

    expect(decoded).toEqual(pullFixture);
    const tables = decoded.tables as Array<{
      changedRows: unknown[];
      table: string;
    }>;
    expect(tables[0].table).toBe("categories");
    expect(typeof tables[0].changedRows[0]).toBe("object");
    expect(typeof tables[0].changedRows[0]).not.toBe("string");
  });
});
