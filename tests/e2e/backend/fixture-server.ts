interface Row extends Record<string, unknown> {}

interface TablePayload {
  changedRows: Row[];
  deletedIds: string[];
  table: string;
}

interface PushedState {
  categories: Row[];
  products: Row[];
}

interface FixtureState {
  categories: Row[];
  products: Row[];
  pushed: PushedState;
}

const port = Number(process.env.BARESYNC_FIXTURE_BACKEND_PORT ?? "18080");
const scopeId = process.env.BARESYNC_FIXTURE_SCOPE_ID ?? "merchant-1";
const serverTime = "2026-05-20T00:00:00.000Z";
const runtime = globalThis as typeof globalThis & {
  Bun: {
    serve(options: {
      fetch: (request: Request) => Response | Promise<Response>;
      port: number;
    }): unknown;
  };
};

const initialState = (): FixtureState => ({
  categories: [
    {
      id: "cat-1",
      merchantId: scopeId,
      name: "Drinks",
      sortOrder: 1,
      createdAt: "2026-05-19T00:00:00.000Z",
      updatedAt: "2026-05-19T00:00:00.000Z",
      deletedAt: null,
      isSynced: true,
    },
  ],
  products: [
    {
      id: "prod-1",
      merchantId: scopeId,
      categoryId: "cat-1",
      name: "Kopi Susu",
      priceMinorUnits: 15_000,
      createdAt: "2026-05-19T00:00:00.000Z",
      updatedAt: "2026-05-19T00:00:00.000Z",
      deletedAt: null,
      isSynced: true,
    },
  ],
  pushed: {
    categories: [],
    products: [],
  },
});

let state = initialState();

function normalizeRow(row: Row): Row {
  return {
    ...row,
    deletedAt: row.deletedAt ?? null,
  };
}

function responseTables(): TablePayload[] {
  return [
    {
      table: "categories",
      changedRows: state.categories.map(normalizeRow),
      deletedIds: [],
    },
    {
      table: "products",
      changedRows: state.products.map(normalizeRow),
      deletedIds: [],
    },
  ];
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json();
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be a JSON object");
  }
  return body as Record<string, unknown>;
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

function applyPush(body: Record<string, unknown>) {
  for (const entry of parseTables(body)) {
    if (entry.table === "categories") {
      for (const row of entry.changedRows) {
        const normalized = normalizeRow(row);
        state.categories = state.categories
          .filter((item) => item.id !== normalized.id)
          .concat(normalized);
        state.pushed.categories.push(normalized);
      }
    }
    if (entry.table === "products") {
      for (const row of entry.changedRows) {
        const normalized = normalizeRow(row);
        state.products = state.products
          .filter((item) => item.id !== normalized.id)
          .concat(normalized);
        state.pushed.products.push(normalized);
      }
    }
  }
}

runtime.Bun.serve({
  port,
  fetch: async (request: Request) => {
    const url = new URL(request.url);

    if (url.pathname === "/__reset" && request.method === "POST") {
      state = initialState();
      return Response.json({ ok: true, scopeId });
    }

    if (url.pathname === "/__state" && request.method === "GET") {
      return Response.json({
        scopeId,
        categories: state.categories,
        products: state.products,
        pushed: state.pushed,
      });
    }

    if (url.pathname === "/sync/pull" && request.method === "GET") {
      const requestedScope = url.searchParams.get("scopeId");
      if (requestedScope !== scopeId) {
        return Response.json({ error: "invalid_scope" }, { status: 404 });
      }

      return Response.json({
        cursor: `sync:${serverTime}:products:prod-1`,
        hasMore: false,
        serverTime,
        tables: responseTables(),
      });
    }

    if (url.pathname === "/sync/push" && request.method === "POST") {
      const body = await readJson(request);
      if (String(body.scopeId ?? "") !== scopeId) {
        return Response.json({ error: "invalid_scope" }, { status: 404 });
      }

      applyPush(body);

      return Response.json({
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
      });
    }

    return Response.json({ error: "not_found" }, { status: 404 });
  },
});

console.log(`[fixture-backend] listening on http://127.0.0.1:${port}`);
