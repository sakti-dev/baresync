import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import {
  decodeSyncRequest,
  encodeSyncResponse,
} from "../../../packages/baresync/src/server/index";
import { resolveFixtureTransportMode } from "../fixture-transport";
import { resolveFixtureBackendHost } from "./fixture-server-config";

interface Row extends Record<string, unknown> {
  deletedAt: string | null;
  id: string;
}

interface TablePayload {
  changedRows: Row[];
  deletedIds: string[];
  table: string;
}

interface LatestCursorRow {
  id: string;
  table: "categories" | "products";
  updatedAt: string;
}

interface StatusPayload {
  changedTables: string[];
  cursor: string;
  hasChanges: boolean;
  serverTime: string;
}

interface SqliteDatabase {
  exec(sql: string): unknown;
  query(sql: string): {
    all(...params: unknown[]): unknown[];
  };
  run(sql: string, ...params: unknown[]): unknown;
}

const port = Number(process.env.BARESYNC_FIXTURE_BACKEND_PORT ?? "18080");
const host = resolveFixtureBackendHost();
const scopeId = process.env.BARESYNC_FIXTURE_SCOPE_ID ?? "merchant-1";
const serverTime = "2026-05-20T00:00:00.000Z";
const transportMode = resolveFixtureTransportMode();
const dbPath = resolveFixtureDbPath();
const sqlite = createFixtureDatabase(dbPath);
const runtime = globalThis as typeof globalThis & {
  Bun: {
    serve(options: {
      fetch: (request: Request) => Response | Promise<Response>;
      port: number;
    }): unknown;
  };
};

function resolveFixtureDbPath(): string {
  const explicit = process.env.BARESYNC_FIXTURE_DB_PATH;
  if (explicit && explicit.trim().length > 0) {
    return explicit;
  }

  const runId = process.env.BARESYNC_FIXTURE_RUN_ID ?? "local";
  return path.resolve("/tmp", `baresync-fixture-${runId}.db`);
}

function createFixtureDatabase(filePath: string): SqliteDatabase {
  if (filePath !== ":memory:") {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  const database = new Database(filePath) as unknown as SqliteDatabase;
  database.run("PRAGMA foreign_keys = ON");
  database.run("PRAGMA journal_mode = MEMORY");
  database.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      is_synced INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      name TEXT NOT NULL,
      price_minor_units INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      is_synced INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS pushed_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      row_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      row_json TEXT,
      recorded_at TEXT NOT NULL
    );
  `);
  resetFixtureState(database);
  return database;
}

function resetFixtureState(database: SqliteDatabase) {
  database.exec(
    "DELETE FROM pushed_rows; DELETE FROM products; DELETE FROM categories;"
  );
  database.run(
    `
      INSERT INTO categories (
        id, merchant_id, name, sort_order, created_at, updated_at, deleted_at, is_synced
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    `,
    "cat-1",
    scopeId,
    "Drinks",
    1,
    "2026-05-19T00:00:00.000Z",
    "2026-05-19T00:00:00.000Z",
    null,
    1
  );
  database.run(
    `
      INSERT INTO products (
        id, merchant_id, category_id, name, price_minor_units, created_at, updated_at, deleted_at, is_synced
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
    `,
    "prod-1",
    scopeId,
    "cat-1",
    "Kopi Susu",
    15_000,
    "2026-05-19T00:00:00.000Z",
    "2026-05-19T00:00:00.000Z",
    null,
    1
  );
}

function normalizedDeletedAt(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function rowToCategory(row: Record<string, unknown>): Row {
  return {
    createdAt: String(row.created_at ?? ""),
    deletedAt: normalizedDeletedAt(row.deleted_at),
    id: String(row.id ?? ""),
    isSynced: Boolean(row.is_synced),
    merchantId: String(row.merchant_id ?? ""),
    name: String(row.name ?? ""),
    sortOrder: Number(row.sort_order ?? 0),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function rowToProduct(row: Record<string, unknown>): Row {
  return {
    categoryId: String(row.category_id ?? ""),
    createdAt: String(row.created_at ?? ""),
    deletedAt: normalizedDeletedAt(row.deleted_at),
    id: String(row.id ?? ""),
    isSynced: Boolean(row.is_synced),
    merchantId: String(row.merchant_id ?? ""),
    name: String(row.name ?? ""),
    priceMinorUnits: Number(row.price_minor_units ?? 0),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function rowToTableRow(row: Record<string, unknown>, table: string): Row {
  return table === "categories" ? rowToCategory(row) : rowToProduct(row);
}

function queryRows(
  sql: string,
  ...params: unknown[]
): Record<string, unknown>[] {
  return sqlite.query(sql).all(...params) as Record<string, unknown>[];
}

function queryCategoryRows(): Row[] {
  return queryRows(
    `
      SELECT id, merchant_id, name, sort_order, created_at, updated_at, deleted_at, is_synced
      FROM categories
      ORDER BY updated_at DESC, id DESC
    `
  ).map((row) => rowToCategory(row));
}

function queryProductRows(): Row[] {
  return queryRows(
    `
      SELECT id, merchant_id, category_id, name, price_minor_units, created_at, updated_at, deleted_at, is_synced
      FROM products
      ORDER BY updated_at DESC, id DESC
    `
  ).map((row) => rowToProduct(row));
}

function queryLatestCursorRows(): LatestCursorRow[] {
  return [
    ...queryRows(
      `
        SELECT id, updated_at
        FROM categories
      `
    ).map((row) => ({
      id: String(row.id ?? ""),
      table: "categories" as const,
      updatedAt: String(row.updated_at ?? ""),
    })),
    ...queryRows(
      `
        SELECT id, updated_at
        FROM products
      `
    ).map((row) => ({
      id: String(row.id ?? ""),
      table: "products" as const,
      updatedAt: String(row.updated_at ?? ""),
    })),
  ];
}

function buildLatestCursorRow(): LatestCursorRow {
  const rows = queryLatestCursorRows();
  const latest = rows.reduce<LatestCursorRow | null>((current, row) => {
    if (current === null) {
      return row;
    }

    if (row.updatedAt > current.updatedAt) {
      return row;
    }

    if (row.updatedAt < current.updatedAt) {
      return current;
    }

    const priority: Record<LatestCursorRow["table"], number> = {
      categories: 0,
      products: 1,
    };
    if (priority[row.table] > priority[current.table]) {
      return row;
    }
    if (priority[row.table] < priority[current.table]) {
      return current;
    }

    return row.id > current.id ? row : current;
  }, null);

  return (
    latest ?? {
      id: "prod-1",
      table: "products",
      updatedAt: serverTime,
    }
  );
}

function buildLatestCursor(): string {
  const row = buildLatestCursorRow();
  return `sync:${row.updatedAt}:${row.table}:${row.id}`;
}

function queryPushedRows(table: string): Row[] {
  return queryRows(
    `
      SELECT row_json
      FROM pushed_rows
      WHERE table_name = ?1 AND operation IN ('upsert', 'insert', 'update')
      ORDER BY id ASC
    `,
    table
  )
    .map((row) => row.row_json)
    .filter((value): value is string => typeof value === "string")
    .map((value) => JSON.parse(value) as Record<string, unknown>)
    .map((row) => rowToTableRow(row, table));
}

function responseTables(requestCursor: string): TablePayload[] {
  if (requestCursor === buildLatestCursor()) {
    return [
      {
        table: "categories",
        changedRows: [],
        deletedIds: [],
      },
      {
        table: "products",
        changedRows: [],
        deletedIds: [],
      },
    ];
  }

  const categories = queryCategoryRows();
  const products = queryProductRows();

  return [
    {
      table: "categories",
      changedRows: categories.filter((row) => row.deletedAt === null),
      deletedIds: categories
        .filter((row) => row.deletedAt !== null)
        .map((row) => row.id),
    },
    {
      table: "products",
      changedRows: products.filter((row) => row.deletedAt === null),
      deletedIds: products
        .filter((row) => row.deletedAt !== null)
        .map((row) => row.id),
    },
  ];
}

function responseStatus(requestCursor: string): StatusPayload {
  const tables = responseTables(requestCursor);
  const changedTables = tables
    .filter(
      (table) => table.changedRows.length > 0 || table.deletedIds.length > 0
    )
    .map((table) => table.table);

  return {
    changedTables,
    cursor: buildLatestCursor(),
    hasChanges: changedTables.length > 0,
    serverTime,
  };
}

function parseTables(body: Record<string, unknown>): TablePayload[] {
  const tables = Array.isArray(body.tables) ? body.tables : [];
  return tables.map((entry) => {
    const obj = entry as Record<string, unknown>;
    return {
      table: String(obj.table ?? ""),
      changedRows: Array.isArray(obj.changedRows)
        ? (obj.changedRows as Row[])
        : [],
      deletedIds: Array.isArray(obj.deletedIds)
        ? (obj.deletedIds as string[])
        : [],
    };
  });
}

function upsertCategory(row: Row) {
  sqlite.run(
    `
      INSERT INTO categories (
        id, merchant_id, name, sort_order, created_at, updated_at, deleted_at, is_synced
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      ON CONFLICT(id) DO UPDATE SET
        merchant_id = excluded.merchant_id,
        name = excluded.name,
        sort_order = excluded.sort_order,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at,
        is_synced = excluded.is_synced
    `,
    String(row.id),
    String(row.merchantId ?? scopeId),
    String(row.name ?? ""),
    Number(row.sortOrder ?? 0),
    String(row.createdAt ?? serverTime),
    String(row.updatedAt ?? serverTime),
    normalizedDeletedAt(row.deletedAt),
    Number(row.isSynced ? 1 : 0)
  );
}

function upsertProduct(row: Row) {
  sqlite.run(
    `
      INSERT INTO products (
        id, merchant_id, category_id, name, price_minor_units, created_at, updated_at, deleted_at, is_synced
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
      ON CONFLICT(id) DO UPDATE SET
        merchant_id = excluded.merchant_id,
        category_id = excluded.category_id,
        name = excluded.name,
        price_minor_units = excluded.price_minor_units,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at,
        is_synced = excluded.is_synced
    `,
    String(row.id),
    String(row.merchantId ?? scopeId),
    String(row.categoryId ?? ""),
    String(row.name ?? ""),
    Number(row.priceMinorUnits ?? 0),
    String(row.createdAt ?? serverTime),
    String(row.updatedAt ?? serverTime),
    normalizedDeletedAt(row.deletedAt),
    Number(row.isSynced ? 1 : 0)
  );
}

function softDeleteCategory(id: string) {
  sqlite.run(
    `
      UPDATE categories
      SET deleted_at = ?1, updated_at = ?2, is_synced = 1
      WHERE id = ?3
    `,
    serverTime,
    serverTime,
    id
  );
}

function softDeleteProduct(id: string) {
  sqlite.run(
    `
      UPDATE products
      SET deleted_at = ?1, updated_at = ?2, is_synced = 1
      WHERE id = ?3
    `,
    serverTime,
    serverTime,
    id
  );
}

function recordPushEvent(
  table: string,
  rowId: string,
  operation: "upsert" | "insert" | "update" | "delete",
  rowJson: string | null
) {
  sqlite.run(
    `
      INSERT INTO pushed_rows (table_name, row_id, operation, row_json, recorded_at)
      VALUES (?1, ?2, ?3, ?4, ?5)
    `,
    table,
    rowId,
    operation,
    rowJson,
    serverTime
  );
}

function applyPush(body: Record<string, unknown>) {
  for (const entry of parseTables(body)) {
    if (entry.table === "categories") {
      for (const row of entry.changedRows) {
        upsertCategory(row);
        recordPushEvent(
          "categories",
          String(row.id ?? ""),
          "upsert",
          JSON.stringify(row)
        );
      }
      for (const deletedId of entry.deletedIds) {
        softDeleteCategory(deletedId);
        recordPushEvent("categories", deletedId, "delete", null);
      }
    }

    if (entry.table === "products") {
      for (const row of entry.changedRows) {
        upsertProduct(row);
        recordPushEvent(
          "products",
          String(row.id ?? ""),
          "upsert",
          JSON.stringify(row)
        );
      }
      for (const deletedId of entry.deletedIds) {
        softDeleteProduct(deletedId);
        recordPushEvent("products", deletedId, "delete", null);
      }
    }
  }
}

function handleResetRequest(): Response | Promise<Response> {
  resetFixtureState(sqlite);
  return Response.json({ ok: true, scopeId });
}

function handleStateRequest(): Response | Promise<Response> {
  return Response.json({
    scopeId,
    categories: queryCategoryRows(),
    products: queryProductRows(),
    pushed: {
      categories: queryPushedRows("categories"),
      products: queryPushedRows("products"),
    },
  });
}

async function handleStatusRequest(request: Request): Promise<Response> {
  const decoded = await decodeFixtureRequest({
    kind: "status",
    request,
  });
  if ("response" in decoded) {
    return decoded.response;
  }
  const body = decoded.body;
  if (String(body.scopeId ?? "") !== scopeId) {
    return Response.json({ error: "invalid_scope" }, { status: 404 });
  }

  return encodeSyncResponse({
    body: responseStatus(String(body.cursor ?? "")),
    encoding: transportMode,
    kind: "status",
  });
}

async function handlePullRequest(request: Request): Promise<Response> {
  if (request.method === "GET") {
    const requestedScope = new URL(request.url).searchParams.get("scopeId");
    if (requestedScope !== scopeId) {
      return Response.json({ error: "invalid_scope" }, { status: 404 });
    }

    return encodeSyncResponse({
      body: {
        cursor: buildLatestCursor(),
        hasMore: false,
        serverTime,
        tables: responseTables(
          String(new URL(request.url).searchParams.get("cursor") ?? "")
        ),
      },
      encoding: transportMode,
      kind: "pull",
    });
  }

  const decoded = await decodeFixtureRequest({
    kind: "pull",
    request,
  });
  if ("response" in decoded) {
    return decoded.response;
  }
  const body = decoded.body;
  if (String(body.scopeId ?? "") !== scopeId) {
    return Response.json({ error: "invalid_scope" }, { status: 404 });
  }

  return encodeSyncResponse({
    body: {
      cursor: buildLatestCursor(),
      hasMore: false,
      serverTime,
      tables: responseTables(String(body.cursor ?? "")),
    },
    encoding: transportMode,
    kind: "pull",
  });
}

async function handlePushRequest(request: Request): Promise<Response> {
  const decoded = await decodeFixtureRequest({
    kind: "push",
    request,
  });
  if ("response" in decoded) {
    return decoded.response;
  }
  const body = decoded.body;
  if (String(body.scopeId ?? "") !== scopeId) {
    return Response.json({ error: "invalid_scope" }, { status: 404 });
  }

  applyPush(body);

  return encodeSyncResponse({
    body: {
      serverTime,
      tables: parseTables(body).map((entry) => ({
        table: entry.table,
        acceptedCreatedIds: entry.changedRows.map((row) =>
          String((row as Row).id ?? "")
        ),
        acceptedUpdatedIds: [],
        acceptedDeletedIds: entry.deletedIds,
        rejected: [],
      })),
    },
    encoding: transportMode,
    kind: "push",
  });
}

async function decodeFixtureRequest(input: {
  kind: "push" | "pull" | "status";
  request: Request;
}): Promise<{ body: Record<string, unknown> } | { response: Response }> {
  try {
    const decoded = await decodeSyncRequest({
      encoding: transportMode,
      kind: input.kind,
      request: input.request,
    });
    return { body: decoded.body };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      response: Response.json(
        {
          error: "invalid_request_body",
          encoding: transportMode,
          kind: input.kind,
          message,
        },
        { status: 400 }
      ),
    };
  }
}

runtime.Bun.serve({
  host,
  port,
  fetch: (request: Request) => {
    const routeKey = `${request.method} ${new URL(request.url).pathname}`;
    console.log(`[fixture-backend] request=${routeKey}`);
    const handler = routeHandlers[routeKey];
    if (handler) {
      return handler(request);
    }

    return Response.json({ error: "not_found" }, { status: 404 });
  },
});

const routeHandlers: Record<
  string,
  (request: Request) => Response | Promise<Response>
> = {
  "POST /__reset": handleResetRequest,
  "GET /__state": handleStateRequest,
  "POST /sync/status": handleStatusRequest,
  "POST /sync/pull": handlePullRequest,
  "GET /sync/pull": handlePullRequest,
  "POST /sync/push": handlePushRequest,
};

console.log(`[fixture-backend] listening on http://${host}:${port}`);
console.log(`[fixture-backend] dbPath=${dbPath}`);
console.log(`[fixture-backend] encoding=${transportMode}`);
