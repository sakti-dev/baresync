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

Run it from the repo root:

```bash
bun run inventory:install
bun run inventory:generate
bun run inventory:dev
```

The shared contract package owns the `locations`, `items`, and `stock_counts` schema. The app uses the public `baresync` package, and the server uses the public `baresync/server` helpers with Hono.

The server DB example now shows two side-by-side repository paths:

- `apps/server/src/db/primitive/sync-repository.ts` and `apps/server/src/db/primitive/utils.ts` show the lower-level sync plumbing.
- `apps/server/src/db/drizzle-helper/sync-repository.ts` and `apps/server/src/db/drizzle-helper/utils.ts` show the Drizzle helper-backed version.

The running app uses the `drizzle-helper` path by default, while the primitive path stays in the tree for comparison.
