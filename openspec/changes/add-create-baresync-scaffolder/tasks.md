## 1. Package Shell

- [ ] 1.1 Add a separate create-style workspace package with package metadata, source entrypoint, build script, and bin metadata.
- [ ] 1.2 Add scaffolder dependencies for prompts, colors, and Node runtime APIs without adding them to the core `baresync` package.
- [ ] 1.3 Include the create package in workspace typecheck, lint, and build verification where appropriate.

## 2. CLI Flow

- [ ] 2.1 Implement package-manager detection from `npm_config_user_agent` and Bun runtime fallback.
- [ ] 2.2 Add fallback package-manager prompt for unknown runners.
- [ ] 2.3 Implement project-name prompt, cancellation handling, and target directory creation.
- [ ] 2.4 Implement interactive command proxy helper using `child_process.spawn` with inherited stdio.
- [ ] 2.5 Proxy official Tauri app creation into `apps/app`.
- [ ] 2.6 Proxy selected Hono or Elysia server creation into `apps/server`.

## 3. Sync Contract Template

- [ ] 3.1 Add todo sync-contract template files for constants, local synced schema, API synced schema, local runtime schema, API runtime schema, sync config, generate script, tsconfig, and package metadata.
- [ ] 3.2 Ensure the template uses `lists` and `todos`, `scope_id`, local/API sync columns, and a `todos` to `lists` relationship.
- [ ] 3.3 Ensure generated sync artifacts are excluded from static templates and produced only by the generation script.
- [ ] 3.4 Add tests or snapshots covering sync-contract template output.

## 4. Migration Config And Workspace Scripts

- [ ] 4.1 Generate local Drizzle config that reads sync-contract local schemas and outputs to the Tauri migrations directory.
- [ ] 4.2 Generate server Drizzle config that reads sync-contract API schemas and outputs to the server migrations directory.
- [ ] 4.3 Add root scripts for local migration generation, server migration generation, sync artifact generation, and development startup.
- [ ] 4.4 Ensure completion guidance includes install, migration generation, sync generation, and development commands for the detected package manager.

## 5. Server Integration

- [ ] 5.1 Generate Baresync server DB client and todo sync repository modules for local Bun + SQLite.
- [ ] 5.2 Generate Hono sync route module and minimally mount it under `/sync` when the entrypoint shape is recognized.
- [ ] 5.3 Generate Elysia sync route module and minimally mount it under `/sync` when the entrypoint shape is recognized.
- [ ] 5.4 Add fallback instructions when server entrypoint patching is unsafe.
- [ ] 5.5 Add tests for recognized and unrecognized server entrypoint patching.

## 6. Tauri Integration

- [ ] 6.1 Generate Tauri Rust setup that uses the simplified Baresync plugin builder API from `simplify-tauri-plugin-registration`.
- [ ] 6.2 Add required Rust dependencies and Tauri bundle resource configuration for generated migrations path.
- [ ] 6.3 Generate framework-neutral frontend DB helper and sync-client helper modules.
- [ ] 6.4 Avoid modifying frontend root components or framework provider trees.
- [ ] 6.5 Add tests or snapshots for generated Tauri helper files and Rust setup patches.

## 7. Documentation

- [ ] 7.1 Update getting-started docs to present `create-baresync` as the default new-project path.
- [ ] 7.2 Keep manual setup docs for existing apps and unsupported scaffolder targets.
- [ ] 7.3 Update example guidance so the inventory example remains the canonical fullstack reference while the todo scaffolder is the default starter.

## 8. Verification

- [ ] 8.1 Run `bun x ultracite check`.
- [ ] 8.2 Run the root typecheck script and any create-package-specific typecheck.
- [ ] 8.3 Run scaffolder unit/snapshot tests.
- [ ] 8.4 Run `openspec status --change add-create-baresync-scaffolder` and confirm all artifacts remain complete.
