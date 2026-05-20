## 1. Workspace scaffold

- [ ] 1.1 Create `examples/inventory` with `apps/app`, `apps/server`, and `packages/sync-contract`.
- [ ] 1.2 Add the example workspace manifests and root scripts needed to install, build, and run the example from one place.
- [ ] 1.3 Add any example-specific config files required by Bun, Tauri, Elysia, and the shared package layout.

## 2. Example implementation

- [ ] 2.1 Define the inventory schema in the shared contract package with `locations`, `items`, and `stock_counts`.
- [ ] 2.2 Generate or wire the sync contract artifacts from the shared schema package.
- [ ] 2.3 Implement the Tauri app integration using the published Baresync package names and a single sync scope.
- [ ] 2.4 Implement the Elysia server integration using the published Baresync server helpers and JSON sync encoding.
- [ ] 2.5 Add a minimal example data flow that exercises create, sync, and read paths across app and server.

## 3. Documentation and verification

- [ ] 3.1 Update the README and docs to point new users to the inventory example as the canonical fullstack starter.
- [ ] 3.2 Add example usage notes that explain the single-scope model and avoid tenant/workspace terminology.
- [ ] 3.3 Add or update smoke checks so the example can be validated without manual guesswork.
- [ ] 3.4 Run the repository formatting, lint, and typecheck checks after the example artifacts are in place.
