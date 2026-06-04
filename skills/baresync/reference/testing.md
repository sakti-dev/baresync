# Testing

How to verify baresync integration code. Only test when the user asks — do not generate tests proactively.

If the exact test target or runtime behavior is unclear, load `reference/source.md` and inspect the mapped workspace source.

## Testing layers

| Layer | What to test | When to use |
|---|---|---|
| Frontend tests | Sync client calls, hooks, event bridges, Drizzle proxy | User asks to test UI code |
| Local database tests | Domain row + outbox row after local writes | User asks to test write path |
| Server contract tests | Push/pull/status handlers, authorization, idempotency | User asks to test server code |
| App smoke tests | Real Tauri app, real SQLite, real backend, restart persistence | User asks for E2E test |

Do not collapse all testing into one layer. Each layer owns a different risk.

## Mock at boundaries

- Frontend tests → mock `invoke`
- Local database tests → real test SQLite, no mocking
- Server contract tests → real `Request` objects, test auth, test storage
- App smoke tests → real app, no mocking of baresync

## Frontend tests

### Mock `invoke`

`createSyncClient` accepts an explicit `invoke` function. Pass a mock in tests:

```ts
import { createSyncClient } from "baresync/tauri";
import { describe, expect, it, vi } from "vitest";

it("loads local sync state", async () => {
  const invoke = vi.fn(async (cmd: string) => {
    if (cmd === "get_sync_local_state") {
      return { local_dirty_count: 3, last_server_watermark: "", needs_baseline_sync: false };
    }
    return {};
  });

  const client = createSyncClient({ scopeId: "merchant-1", invoke });

  await expect(client.getState()).resolves.toMatchObject({ local_dirty_count: 3 });
  expect(invoke).toHaveBeenCalledWith("get_sync_local_state", { scopeId: "merchant-1" });
});
```

### Simulate errors

```ts
const client = createSyncClient({
  scopeId: "merchant-1",
  invoke: async () => { throw new Error("network unavailable"); },
});

await expect(client.syncNow()).rejects.toThrow("network unavailable");
```

### Test event bridges

Mock `@tauri-apps/api/event` and capture the listener:

```ts
const listen = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/event", () => ({ listen }));

it("invalidates queries on data-changed event", async () => {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const listeners = new Map<string, (event: unknown) => void>();

  listen.mockImplementation((event, handler) => {
    listeners.set(event, handler);
    return Promise.resolve(async () => {});
  });

  render(createElement(QueryClientProvider, { client: queryClient }, createElement(SyncEventBridge)));

  await waitFor(() => expect(listeners.has("baresync://data-changed")).toBe(true));
  await listeners.get("baresync://data-changed")?.(undefined);

  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["inventory"] });
});
```

### Test Drizzle proxy

Mock `invoke` at the SQL command boundary:

```ts
const db = createTauriDrizzleDatabase({
  schema: { items },
  invoke: async (cmd, args) => {
    if (cmd === "run_sql") {
      const query = args?.query as { params: unknown[]; sql: string };
      calls.push(query);
      return [];
    }
    return { rows_affected: 0 };
  },
});

await db.select().from(items);
expect(calls[0].sql).toContain("items");
```

## Local database tests

The most important app-level sync test: when your app writes local data, it must also enqueue a pending outbox row.

### What to assert

For each local write path:

1. Domain row is written to the expected table
2. Row has the expected scope ID
3. Row is marked dirty (`is_synced = 0`)
4. A `sync_outbox` row exists for the same table and row ID
5. Outbox row has the same scope ID as the sync client
6. `synced_at` is `NULL`
7. Operation is correct (`insert` or `update`)

### Example

```ts
import { Database } from "bun:sqlite";

function createTestDatabase() {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE items (id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, name TEXT NOT NULL,
      is_synced INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE sync_outbox (id TEXT PRIMARY KEY, table_name TEXT NOT NULL, row_id TEXT NOT NULL,
      operation TEXT NOT NULL, payload TEXT, scope_id TEXT NOT NULL, changed_at TEXT NOT NULL, synced_at TEXT);
  `);
  return sqlite;
}

it("creates an item and queues it for sync", async () => {
  const sqlite = createTestDatabase();
  await createLocalItem({ db: sqlite, id: "item-1", name: "Coffee", scopeId: "merchant-1" });

  const item = sqlite.query("SELECT id, is_synced FROM items WHERE id = ?1").get("item-1");
  expect(item).toEqual({ id: "item-1", is_synced: 0 });

  const outbox = sqlite.query("SELECT table_name, row_id, operation, scope_id, synced_at FROM sync_outbox WHERE row_id = ?1").get("item-1");
  expect(outbox).toEqual({ table_name: "items", row_id: "item-1", operation: "insert", scope_id: "merchant-1", synced_at: null });
});
```

## Server contract tests

Test handlers with real `Request` objects — no running HTTP server needed.

### Push handler

```ts
import { createSyncPushHandler } from "baresync/server";

it("authorizes and applies push in table order", async () => {
  const applyPushChanges = vi.fn(async (input) => ({
    serverTime: "2026-05-20T00:00:00.000Z",
    tables: input.changes.map((c) => ({ table: c.table, changedRows: c.changedRows, deletedIds: c.deletedIds })),
  }));

  const handler = createSyncPushHandler({
    resolveScope: async ({ scopeId }) => ({ ok: true, scope: { merchantId: scopeId } }),
    upsertOrder: ["categories", "products"],
    idempotency: { db: createTestIdempotencyDb() },
    applyPushChanges,
  });

  const response = await handler(
    new Request("https://api.test/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scopeId: "merchant-1", clientId: "client-1", idempotencyKey: "idem-1",
        tables: [
          { changedRows: [{ id: "prod-1" }], deletedIds: [], table: "products" },
          { changedRows: [{ id: "cat-1" }], deletedIds: [], table: "categories" },
        ],
      }),
    }),
    {}
  );

  expect(response.status).toBe(200);
  // Verify table ordering
  expect(applyPushChanges.mock.calls[0][0].changes.map((c) => c.table)).toEqual(["categories", "products"]);
});
```

### Authorization

```ts
it("rejects unauthorized scopes", async () => {
  const handler = createSyncPushHandler({
    resolveScope: async () => ({ ok: false, status: 403, body: { error: "forbidden" } }),
    upsertOrder: ["items"],
    idempotency: { db: createTestIdempotencyDb() },
    applyPushChanges: vi.fn(),
  });

  const response = await handler(createPushRequest({ scopeId: "other" }), {});
  expect(response.status).toBe(403);
});
```

### Idempotency

Use a real test database, not in-memory objects:

```ts
import { createIdempotencyGuard } from "baresync/server";

it("replays duplicate push responses", async () => {
  const guard = createIdempotencyGuard({ db: createTestIdempotencyDb() });
  let callCount = 0;

  const first = await guard.run(
    { clientId: "client-1", idempotencyKey: "key-1", requestHash: "hash-a" },
    async () => { callCount++; return { serverTime: "2026-05-20T00:00:00.000Z" }; }
  );

  const second = await guard.run(
    { clientId: "client-1", idempotencyKey: "key-1", requestHash: "hash-a" },
    async () => { callCount++; return { serverTime: "2026-05-20T00:00:00.000Z" }; }
  );

  expect(first.wasReplay).toBe(false);
  expect(second.wasReplay).toBe(true);
  expect(callCount).toBe(1);
});
```

### Contract checklist

A good server contract suite asserts:

- Valid scopes can status, pull, and push
- Invalid scopes are rejected before data changes
- Push changes are applied in dependency order
- Accepted row IDs are returned in the expected shape
- Duplicate idempotency keys replay the cached response
- Same idempotency key with different body fails

## App smoke tests

Keep smoke tests small. Prove the wiring, not every edge case.

### What to prove

- Plugin registration
- Migrations ran
- Baseline pull works
- Local create works
- Manual sync pushes to backend
- Accepted rows become clean
- Restart persistence

### Desktop smoke scenario

1. Launch app, wait for ready state
2. Assert migrations ran
3. Trigger baseline sync, assert server rows appear locally
4. Create one local row, assert it appears before sync
5. Trigger manual sync, assert backend recorded it, assert local row is clean
6. Restart app, assert row and clean state persisted

### Android smoke scenario

1. Clear app data or install fresh build
2. Launch app, wait for ready UI
3. Trigger baseline sync, assert server rows render
4. Create one local row, trigger manual sync
5. Assert clean state
6. Kill and relaunch, assert persistence

Backend URLs: emulator → `http://10.0.2.2:<port>`, physical device → LAN IP.

### What NOT to put in smoke tests

- Conflict resolution matrices
- Cursor ordering edge cases
- Idempotency internals
- Chunk sizing
- Every synced table

Put those in server contract tests or local database tests.

## E2E debugging sequence

When a smoke test fails, debug in this order:

1. Backend running and responds to state endpoint
2. App received the same backend URL the test inspects
3. App using a fresh local database path
4. App reached readiness before test clicked anything
5. Migrations ran
6. Baseline pull returned rows from backend
7. Local create wrote the source table row
8. Local create wrote a pending `sync_outbox` row
9. Manual sync sent the push payload
10. Backend recorded the pushed row
11. Accepted outbox rows marked synced
12. Accepted source rows marked clean
13. Restart uses the same expected database path

## Required assertions

At minimum, assert both sides:

**Server-side:** backend starts in known state, baseline data exists, pushed row IDs recorded after sync.

**Local-side:** migrations ran, baseline rows exist locally, local writes create pending outbox entries, accepted rows become clean, dirty count returns to zero, clean state survives restart.

Backend acceptance alone is not enough. A row can be accepted by the server while remaining dirty locally.
