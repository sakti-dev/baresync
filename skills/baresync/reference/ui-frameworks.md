# UI Frameworks

The scaffold gives you two framework-agnostic pieces:

- **`db.ts`** — `createTauriDrizzleDatabase` + TABLE registry
- **`baresync-sync-client.ts`** — `createSyncClient` scoped to `SYNC_SCOPE`

What's left is wiring these into your UI framework. The pattern is the same for any framework.

## The pattern

1. **Create a provider** that holds the `SyncClient` and provides it to the component tree
2. **Start background polling** on mount, stop on unmount
3. **Listen for Tauri events** (`baresync://data-changed`, `baresync://sync-status-changed`) and invalidate your query cache
4. **Query data** from local SQLite via Drizzle using a query library (React Query, Solid Query, etc.)

You never poll the database. The Rust engine emits events when data changes, and your query library handles the rest.

## React

### Dependencies

```bash
bun add @tanstack/react-query @tauri-apps/api
```

### Provider

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createSyncClient, type SyncClient } from "baresync/tauri";
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";

const SyncClientContext = createContext<SyncClient | null>(null);

export function SyncClientProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [client] = useState(() => createSyncClient({ scopeId: "your-scope-id", invoke }));
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    client.startPolling();
    return () => { client.stopPolling().catch(() => {}); };
  }, [client]);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => Promise<void> | void) | null = null;

    Promise.all([
      listen("baresync://data-changed", async () => {
        await queryClient.invalidateQueries({ queryKey: ["inventory"] });
        await queryClient.invalidateQueries({ queryKey: ["sync-state"] });
      }),
      listen("baresync://sync-status-changed", async () => {
        await queryClient.invalidateQueries({ queryKey: ["sync-state"] });
      }),
    ]).then(([unlistenData, unlistenStatus]) => {
      const release = async () => {
        await Promise.all([unlistenData(), unlistenStatus()]);
      };
      if (disposed) { release(); return; }
      cleanup = release;
    }).catch(() => undefined);

    return () => { disposed = true; if (cleanup) cleanup(); };
  }, [queryClient]);

  return <SyncClientContext.Provider value={client}>{children}</SyncClientContext.Provider>;
}

export function useSyncClient(): SyncClient {
  const client = useContext(SyncClientContext);
  if (!client) throw new Error("useSyncClient must be used within SyncClientProvider");
  return client;
}
```

### Query hook

```tsx
import { useQuery } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";

export function useDrizzleQuery<Row>(queryKey: QueryKey, buildQuery: () => Promise<Row[]>) {
  const query = useQuery({ queryKey, queryFn: async () => await buildQuery() });
  return {
    error: query.error ? String(query.error) : null,
    loading: query.isPending,
    refresh: async () => { await query.refetch(); },
    rows: query.data ?? [],
  };
}
```

### Usage

```tsx
// Provider tree
<QueryClientProvider client={queryClient}>
  <SyncClientProvider>
    <App />
  </SyncClientProvider>
</QueryClientProvider>

// Query
const items = useDrizzleQuery(["inventory", "items"], () =>
  db.select().from(TABLE.items)
);

// Write
await client.writeTransaction(db, async (tx) => {
  await client.writeLocalChange(tx, {
    operation: "insert",
    rowId: id,
    table: TABLE.items,
    write: (writeTx) => writeTx.insert(TABLE.items).values({ id, name: "New item", ... }),
  });
});
await queryClient.invalidateQueries({ queryKey: ["inventory", "items"] });
```

## Solid

### Dependencies

```bash
bun add @tanstack/solid-query @tauri-apps/api
```

### Provider

```tsx
import { useQueryClient } from "@tanstack/solid-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createSyncClient, type SyncClient } from "baresync/tauri";
import { createContext, createEffect, createSignal, onCleanup, useContext, type ParentComponent } from "solid-js";

const SyncClientContext = createContext<SyncClient>();

export const SyncClientProvider: ParentComponent = (props) => {
  const queryClient = useQueryClient();
  const [client] = createSignal(createSyncClient({ scopeId: "your-scope-id", invoke }));

  createEffect(() => {
    client().startPolling();
    onCleanup(() => client().stopPolling().catch(() => {}));
  });

  createEffect(() => {
    let disposed = false;
    let cleanup: (() => Promise<void> | void) | null = null;

    Promise.all([
      listen("baresync://data-changed", async () => {
        await queryClient.invalidateQueries({ queryKey: ["inventory"] });
        await queryClient.invalidateQueries({ queryKey: ["sync-state"] });
      }),
      listen("baresync://sync-status-changed", async () => {
        await queryClient.invalidateQueries({ queryKey: ["sync-state"] });
      }),
    ]).then(([unlistenData, unlistenStatus]) => {
      const release = async () => {
        await Promise.all([unlistenData(), unlistenStatus()]);
      };
      if (disposed) { release(); return; }
      cleanup = release;
    }).catch(() => undefined);

    onCleanup(() => { disposed = true; if (cleanup) cleanup(); });
  });

  return <SyncClientContext.Provider value={client()}>{props.children}</SyncClientContext.Provider>;
};

export function useSyncClient(): SyncClient {
  const client = useContext(SyncClientContext);
  if (!client) throw new Error("useSyncClient must be used within SyncClientProvider");
  return client;
}
```

### Query hook

```tsx
import { createQuery } from "@tanstack/solid-query";

export function useDrizzleQuery<Row>(queryKey: unknown[], buildQuery: () => Promise<Row[]>) {
  const query = createQuery(() => ({ queryKey, queryFn: async () => await buildQuery() }));
  return {
    error: () => (query.error ? String(query.error) : null),
    loading: () => query.isPending,
    rows: () => query.data ?? [],
  };
}
```

### Usage

```tsx
// Query
const items = useDrizzleQuery(["inventory", "items"], () =>
  db.select().from(TABLE.items)
);
// items.rows() — accessor function, not plain value

// Write — identical to React, no framework primitives needed
await client.writeTransaction(db, async (tx) => {
  await client.writeLocalChange(tx, {
    operation: "insert",
    rowId: id,
    table: TABLE.items,
    write: (writeTx) => writeTx.insert(TABLE.items).values({ id, name: "New item", ... }),
  });
});
await queryClient.invalidateQueries({ queryKey: ["inventory", "items"] });
```

## Key differences

| Concern | React | Solid |
|---|---|---|
| State | `useState` | `createSignal` |
| Effects | `useEffect` | `createEffect` + `onCleanup` |
| Query result | Plain object `{ rows, loading }` | Accessor functions `rows()`, `loading()` |
| List rendering | `.map()` | `<For each={}>` |
| Conditional | `&&` / ternary | `<Show when={}>` |

## Events

| Event | When | What to invalidate |
|---|---|---|
| `baresync://data-changed` | Local data changed (rows_affected > 0) | Data queries + sync state |
| `baresync://sync-status-changed` | Polling starts/stops or sync cycle completes | Sync state only |

## Other frameworks

The write patterns (`writeTransaction` + `writeLocalChange`) are identical across all frameworks — they don't use any framework primitives. Only the provider/context wiring and query invalidation differ.

## SyncClient methods

| Method | Description |
|---|---|
| `syncNow()` | Auto-selects best mode and runs push+pull |
| `push()` | Push outbox only, no pull |
| `pull()` | Pull only, no push |
| `fullResync()` | Baseline pull from scratch, then push |
| `getState()` | Returns `{ local_dirty_count, last_server_watermark, needs_baseline_sync }` |
| `startPolling()` | Start automatic sync on interval |
| `stopPolling()` | Stop polling entirely |
| `pausePolling()` | Pause without stopping the timer |
| `resumePolling()` | Resume from pause |
| `getPollingStatus()` | Returns `{ running, paused, last_sync_at }` |
| `writeTransaction(db, tx)` | Open a Drizzle transaction |
| `writeLocalChange(tx, opts)` | Atomic write + outbox entry |
| `enqueueChange(tx, opts)` | Outbox entry only, no write |

## Displaying sync status

Use `getState()` to show sync status in your UI:

```ts
const state = await client.getState();
if (state.needs_baseline_sync) {
  // "Setting up..." or trigger fullResync
} else if (state.local_dirty_count > 0) {
  // "Syncing..." or badge with count
} else {
  // "Up to date"
}
```

Invalidate the `["sync-state"]` query key when `baresync://sync-status-changed` fires.

## Common mistakes

- **Creating a new client on every render.** Use `useState` or `useRef` with an initializer.
- **Passing the wrong scopeId.** Must match `sync.config.ts`. Check your server's `resolveScope`.
- **Forgetting to pass `invoke`.** Default stub throws outside Tauri. Always pass `invoke` from `@tauri-apps/api/core`.
- **Not cleaning up polling.** Call `stopPolling()` on unmount to avoid leaked timers.

## Testing

If you need to test UI code that uses baresync, see [reference/testing.md](testing.md) — frontend tests section covers mock `invoke`, event bridge testing, and Drizzle proxy mocking.

## Production

For building sync status indicators and monitoring sync health, see [reference/production.md](production.md) — monitoring sync health section.
