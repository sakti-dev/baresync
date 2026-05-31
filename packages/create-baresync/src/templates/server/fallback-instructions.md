# Manual mount required

The generated sync route module was written to `src/__ROUTE_FILE__`.

If the entrypoint shape differs from the expected official CLI template, mount the routes manually:

- Hono: `app.route("/sync", createBaresyncRoutes(...))`
- Elysia: `app.use(createBaresyncRoutes(...))`
