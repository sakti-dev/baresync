## 1. Workspace scaffold

- [x] 1.1 Create `examples/inventory` with `apps/app`, `apps/server`, and `packages/sync-contract`.
- [x] 1.2 Add the example workspace manifests and root scripts needed to install, build, and run the example from one place.
- [x] 1.3 Add any example-specific config files required by Bun, Tauri, Hono, and the shared package layout.

## 2. Example implementation

- [x] 2.1 Define the inventory schema in the shared contract package with `locations`, `items`, and `stock_counts`.
- [x] 2.2 Generate or wire the sync contract artifacts from the shared schema package.
- [x] 2.3 Implement the Tauri app integration using the published Baresync package names and a single sync scope.
- [x] 2.4 Implement the Hono server integration using the published Baresync server helpers and JSON sync encoding.
- [x] 2.5 Add a minimal example data flow that exercises create, sync, and read paths across app and server.

## 3. Documentation and verification

- [x] 3.1 Update the README and docs to point new users to the inventory example as the canonical fullstack starter.
- [x] 3.2 Add example usage notes that explain the single-scope model and avoid tenant/workspace terminology.
- [x] 3.3 Add or update smoke checks so the example can be validated without manual guesswork.
- [x] 3.4 Run the repository formatting, lint, and typecheck checks after the example artifacts are in place.
