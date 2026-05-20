## Why

Baresync now has publishable package names and release-ready artifacts, so the next missing piece is a complete example that shows how a consumer would actually use them. A single, opinionated inventory app is enough to demonstrate the full path without introducing multi-tenant jargon or a shallow toy demo.

## What Changes

- Add one fullstack example under `examples/inventory`.
- Structure the example as a monorepo with:
  - `apps/app` for the Tauri client
  - `apps/server` for the Hono backend
  - `packages/sync-contract` for the shared schema and generated sync contract
- Use a simple inventory domain with a small table set such as `locations`, `items`, and `stock_counts`.
- Keep the example single-user or single-scope, not multi-tenant.
- Update docs and README guidance so the example becomes the canonical quick-start path for consumers.
- Use the published package names in the example instead of workspace-only imports.

## Capabilities

### New Capabilities
- `inventory-example`: a complete, copyable fullstack example showing a Tauri app, a Hono server, and a shared sync contract built on the published Baresync packages.

### Modified Capabilities
- None.

## Impact

- Adds a new `examples/inventory` workspace to the repository.
- Updates documentation to point at the inventory example as the recommended fullstack starting point.
- Introduces a consumer-facing app/server split that exercises the published npm package and Rust plugin crates.
- May add or update example-specific smoke tests or fixture data once implementation begins.
