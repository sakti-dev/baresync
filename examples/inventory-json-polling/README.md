# Inventory Example

This is the canonical fullstack reference for Baresync.

If you want the default new-project path, use `create-baresync`.

It stays single-scope on purpose:

- scope id: `default`
- no tenant
- no workspace
- no merchant

Workspace layout:

```txt
apps/app
apps/server
packages/sync-contract
```

Run it from the example root:

```bash
bun install
bun run generate
bun run dev
```

The shared contract package owns the `locations`, `items`, and `stock_counts` schema. The app uses the public `baresync` package, and the server uses the public `baresync/server` helpers with Hono.

The inventory app now starts plugin polling automatically on launch, listens for `baresync://data-changed` and `baresync://sync-status-changed`, and uses React Query to invalidate inventory and sync-state caches instead of polling on an interval.

The example also demonstrates authenticated sync requests without adding a login UI. The Tauri app reads `INVENTORY_SYNC_TOKEN` at startup, calls `client.setHeaders({ Authorization: \`Bearer ${token}\` })`, and then starts polling. The Hono sync routes enforce the same bearer token on `status`, `pull`, and `push`. If `INVENTORY_SYNC_TOKEN` is unset, both sides fall back to the built-in `demo-token`.

Local migrations are configured once in Rust, but they stay as files in `apps/app/src-tauri/migrations`. The app registers the plugin with `BaresyncBuilder::migrations_path("migrations")`, so the plugin loads and applies pending SQL migrations during setup. The React app does not call `run_migrations` before starting.

The inventory table hooks own the Drizzle queries, while `DataTable` stays presentational and only receives rows, loading state, and columns.

The server DB example now shows two side-by-side repository paths:

- `apps/server/src/db/primitive/sync-repository.ts` and `apps/server/src/db/primitive/utils.ts` show the lower-level sync plumbing.
- `apps/server/src/db/drizzle-helper/sync-repository.ts` and `apps/server/src/db/drizzle-helper/utils.ts` show the Drizzle helper-backed version.

The running app uses the `drizzle-helper` path by default, while the primitive path stays in the tree for comparison.
