import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  decodeSyncRequest,
  encodeSyncResponse,
  orderPushChanges,
  validatePushEnvelope,
} from "../service";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, "../../../fixtures/sync");

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

describe("push fixture encoding parity", () => {
  it("decodes push fixture and re-encodes consistently", async () => {
    const pushFixture = loadFixture("category-product-push.json");

    const decoded = await decodeSyncRequest({
      encoding: "json",
      kind: "push",
      request: createJsonRequest(pushFixture),
    });

    expect(decoded.body.scopeId).toBe("merchant-1");
    const tables = decoded.body.tables as Array<{
      table: string;
      deletedIds: string[];
    }>;
    expect(tables).toHaveLength(2);
    expect(tables[0].table).toBe("categories");
    expect(tables[1].table).toBe("products");
    expect(tables[1].deletedIds).toContain("prod-deleted-1");

    const response = encodeSyncResponse({
      body: {
        serverTime: "2026-05-19T12:00:00.000Z",
        tables: [
          {
            table: "categories",
            acceptedCreatedIds: ["cat-1"],
            acceptedUpdatedIds: [],
            acceptedDeletedIds: [],
            rejected: [],
          },
          {
            table: "products",
            acceptedCreatedIds: ["prod-1"],
            acceptedUpdatedIds: [],
            acceptedDeletedIds: ["prod-deleted-1"],
            rejected: [],
          },
        ],
      },
      encoding: "json",
      kind: "push",
    });

    expect(response.headers.get("Content-Type")).toContain("application/json");
    const body = await response.json();
    expect(body.tables[0].acceptedCreatedIds).toEqual(["cat-1"]);
  });
});

describe("push primitives with fixture data", () => {
  it("validates fixture push envelope", async () => {
    const pushFixture = loadFixture("category-product-push.json");
    const decoded = await decodeSyncRequest({
      encoding: "json",
      kind: "push",
      request: createJsonRequest(pushFixture),
    });

    validatePushEnvelope(decoded, {
      maxBytes: 2 * 1024 * 1024,
      maxRows: 2000,
    });
  });

  it("orders fixture changes by contract order", () => {
    const pushFixture = loadFixture("category-product-push.json");
    const reversed = [...pushFixture.tables].reverse();

    const ordered = orderPushChanges({
      changes: reversed,
      order: ["categories", "products"],
    });

    expect(ordered[0].table).toBe("categories");
    expect(ordered[1].table).toBe("products");
  });
});
