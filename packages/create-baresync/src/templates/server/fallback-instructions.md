# Manual mount required

The generated sync route module was written to `src/v1/routes.ts`.

If the entrypoint shape differs from the expected CLI template, mount the routes manually:

- Hono: `app.route("/api/sync/v1", sync)` where `sync` is the default export from `./v1/routes`
- Elysia: `app.use(sync)` where `sync` is exported from `./v1/routes`

Both route modules are self-contained — they create their own database connection and resolveScope. The database client is at `src/db/client.ts` and the sync repository is at `src/db/v1/sync-repository.ts`.
