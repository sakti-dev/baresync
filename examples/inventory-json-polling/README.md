# Inventory Example

This is the canonical fullstack starter for Baresync.

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

The inventory app now starts plugin polling automatically on launch, and the sync panel shows the current polling state and last sync time.

The server DB example now shows two side-by-side repository paths:

- `apps/server/src/db/primitive/sync-repository.ts` and `apps/server/src/db/primitive/utils.ts` show the lower-level sync plumbing.
- `apps/server/src/db/drizzle-helper/sync-repository.ts` and `apps/server/src/db/drizzle-helper/utils.ts` show the Drizzle helper-backed version.

The running app uses the `drizzle-helper` path by default, while the primitive path stays in the tree for comparison.
