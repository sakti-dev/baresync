## Why

Baresync currently documents a long manual setup path for creating a Tauri app, server, shared sync contract, migrations, generated sync artifacts, and plugin wiring. A `create-baresync` scaffolder can turn that repeated setup into a guided flow while still delegating app boilerplate to the official Tauri, Hono, and Elysia CLIs.

## What Changes

- Add a create-style scaffolder package for `bun create baresync` and equivalent package-manager create flows.
- Detect the invoking package manager from the runtime environment and use it consistently for proxied CLI commands and generated scripts.
- Proxy official Tauri and server framework CLIs with inherited stdio so users keep native prompts.
- Copy a default todo sync-contract template with `lists` and `todos` schemas, runtime schemas, sync config, package exports, and TypeScript config.
- Generate Drizzle config files and scripts for local Tauri migrations and server migrations, but do not generate SQL migration files directly.
- Generate Baresync server integration as separate route/module files, then minimally mount them into recognized Hono or Elysia entrypoints.
- Generate Tauri-side Baresync helper files and compact plugin setup targeting the simplified plugin registration API from `simplify-tauri-plugin-registration`.
- Leave frontend UI/provider mounting to docs and generated helper modules because Tauri UI templates vary widely.
- Update getting-started docs to describe the scaffolder and retain manual setup as an escape hatch.

## Capabilities

### New Capabilities

- `project-scaffolder`: Create-style CLI behavior, template outputs, official CLI proxying, package-manager detection, server route mounting, Tauri setup, and generated next-step guidance.

### Modified Capabilities

- `workspace-shells`: Workspace setup requirements now include a create-style package surface in addition to the existing `baresync` library/CLI package.
- `inventory-example`: Example/docs guidance changes from only manual setup toward a scaffolded todo starter as the default onboarding path while preserving the inventory example as a richer reference.

## Impact

Affected code includes workspace package layout, npm package metadata, scaffolder templates, docs, and tests for generated project contents. This change should be implemented after `simplify-tauri-plugin-registration` so generated Tauri setup can use plugin-owned commands and generated contract metadata instead of app-local Rust wrappers.
