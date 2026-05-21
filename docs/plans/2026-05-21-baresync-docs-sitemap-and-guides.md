# Baresync Docs Sitemap and Guides Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a comprehensive Baresync documentation site that teaches the full library surface, including schema helpers, generator, local database proxy, JS sync client, Tauri plugin, server helpers, React integration, SolidJS integration, testing, operations, and API reference.

**Architecture:** Keep the docs information architecture task-oriented first, then reference-oriented. Use Fumadocs MDX pages under `apps/docs/content/docs`, grouped by capability directories with local `meta.json` files for navigation. Start with a small number of high-value pages that explain the happy path, then add framework and reference pages without duplicating full examples.

**Tech Stack:** Waku, Fumadocs MDX, React docs app, Mermaid diagrams, TypeScript, Baresync TypeScript package, `baresync-core`, `tauri-plugin-baresync`, Drizzle SQLite, React Query, Solid Query.

---

## Rules for This Plan

- Use TDD-style verification for docs structure: write or update navigation first, add pages, then run docs typecheck/build.
- Keep each page focused on one reader job.
- Prefer copyable code snippets from the current repo over invented APIs.
- Keep React and SolidJS docs parallel, but do not duplicate the full inventory example.
- Do not document unsupported behavior as stable.
- Keep JSON as the primary path; document protobuf as optional.
- After each task, commit a small coherent change.

## Current Docs Context

Existing docs files:

- `apps/docs/content/docs/index.mdx`
- `apps/docs/content/docs/quickstart.mdx`
- `apps/docs/content/docs/concepts.mdx`
- `apps/docs/content/docs/architecture.mdx`
- `apps/docs/content/docs/examples.mdx`
- `apps/docs/content/docs/meta.json`

Important implementation references:

- `README.md`
- `examples/inventory-json-polling/README.md`
- `examples/inventory-json-polling/apps/app/src/App.tsx`
- `examples/inventory-json-polling/apps/app/src/hooks/useBaresyncQuery.ts`
- `examples/inventory-json-polling/apps/app/src/hooks/useSyncState.ts`
- `examples/inventory-json-polling/apps/app/src/lib/db.ts`
- `examples/inventory-json-polling/apps/app/src/components/SeedPanel.tsx`
- `examples/inventory-json-polling/apps/app/src-tauri/src/lib.rs`
- `packages/baresync/src/schema/index.ts`
- `packages/baresync/src/generator/index.ts`
- `packages/baresync/src/db/index.ts`
- `packages/baresync/src/tauri/index.ts`
- `packages/baresync/src/server/index.ts`
- `crates/tauri-plugin-baresync/src/builder.rs`
- `crates/tauri-plugin-baresync/src/commands.rs`
- `crates/tauri-plugin-baresync/src/polling.rs`
- `crates/baresync-core/src/migrations.rs`

## Target Sitemap

```txt
/docs
  index
  quickstart
  concepts
  architecture
  examples

/docs/getting-started
  introduction
  install
  first-sync-contract
  generate-artifacts
  register-tauri-plugin
  query-sqlite
  write-local-changes
  add-server-routes
  run-sync
  troubleshooting-first-run

/docs/schema
  overview
  synced-tables
  local-sync-columns
  api-sync-columns
  runtime-tables
  table-helpers
  diagnostics

/docs/generator
  overview
  define-sync-config
  define-protobuf-sync-config
  cli
  generated-files
  protobuf-workspace
  diagnostics

/docs/local-database
  overview
  create-tauri-drizzle-database
  table-registry-pattern
  transactions
  migrations
  db-info
  debugging

/docs/js-client
  overview
  create-sync-client
  sync-commands
  polling
  local-write-helpers
  bulk-mutations
  error-handling
  testing

/docs/tauri-plugin
  overview
  installation
  builder
  commands
  migrations
  polling
  events
  host-testing

/docs/server
  overview
  route-shape
  status-handler
  pull-handler
  push-handler
  scope-resolution
  idempotency
  cursors
  drizzle-repository-helper
  low-level-primitives
  errors

/docs/ui-frameworks
  overview
  react
  solid
  framework-agnostic-patterns

/docs/sync-engine
  overview
  sync-modes
  status-flow
  pull-flow
  push-flow
  chunking
  reconciliation
  cleanup

/docs/protobuf
  overview
  generator-outputs
  typescript-runtime
  rust-mappers
  server-helpers
  json-compatibility

/docs/testing
  overview
  js-client-tests
  server-tests
  rust-core-simulation
  tauri-plugin-host-tests
  inventory-app-tests
  e2e-runbook

/docs/operations
  overview
  versioning-contracts
  regenerating-artifacts
  managing-migrations
  resetting-local-db
  debugging-outbox
  debugging-cursors
  network-failures
  performance

/docs/reference
  overview
  typescript-api
  rust-api
  generated-artifacts
  commands
  events
  errors
  glossary

/docs/migration-guides
  from-raw-tauri-sqlite
  from-manual-outbox-inserts
  from-interval-polling
  from-js-migrations
  from-primitive-server-repository
```

## Task 1: Create the Docs Navigation Skeleton

**Files:**

- Modify: `apps/docs/content/docs/meta.json`
- Create: `apps/docs/content/docs/getting-started/meta.json`
- Create: `apps/docs/content/docs/schema/meta.json`
- Create: `apps/docs/content/docs/generator/meta.json`
- Create: `apps/docs/content/docs/local-database/meta.json`
- Create: `apps/docs/content/docs/js-client/meta.json`
- Create: `apps/docs/content/docs/tauri-plugin/meta.json`
- Create: `apps/docs/content/docs/server/meta.json`
- Create: `apps/docs/content/docs/ui-frameworks/meta.json`
- Create: `apps/docs/content/docs/sync-engine/meta.json`
- Create: `apps/docs/content/docs/protobuf/meta.json`
- Create: `apps/docs/content/docs/testing/meta.json`
- Create: `apps/docs/content/docs/operations/meta.json`
- Create: `apps/docs/content/docs/reference/meta.json`
- Create: `apps/docs/content/docs/migration-guides/meta.json`

**Step 1: Update the root docs nav**

Replace `apps/docs/content/docs/meta.json` with:

```json
{
  "title": "Baresync",
  "pages": [
    "index",
    "quickstart",
    "concepts",
    "architecture",
    "getting-started",
    "schema",
    "generator",
    "local-database",
    "js-client",
    "tauri-plugin",
    "server",
    "ui-frameworks",
    "sync-engine",
    "protobuf",
    "examples",
    "testing",
    "operations",
    "reference",
    "migration-guides"
  ]
}
```

**Step 2: Add section meta files**

Create `apps/docs/content/docs/getting-started/meta.json`:

```json
{
  "title": "Getting Started",
  "pages": [
    "introduction",
    "install",
    "first-sync-contract",
    "generate-artifacts",
    "register-tauri-plugin",
    "query-sqlite",
    "write-local-changes",
    "add-server-routes",
    "run-sync",
    "troubleshooting-first-run"
  ]
}
```

Create `apps/docs/content/docs/schema/meta.json`:

```json
{
  "title": "Schema",
  "pages": [
    "overview",
    "synced-tables",
    "local-sync-columns",
    "api-sync-columns",
    "runtime-tables",
    "table-helpers",
    "diagnostics"
  ]
}
```

Create `apps/docs/content/docs/generator/meta.json`:

```json
{
  "title": "Generator",
  "pages": [
    "overview",
    "define-sync-config",
    "define-protobuf-sync-config",
    "cli",
    "generated-files",
    "protobuf-workspace",
    "diagnostics"
  ]
}
```

Create `apps/docs/content/docs/local-database/meta.json`:

```json
{
  "title": "Local Database",
  "pages": [
    "overview",
    "create-tauri-drizzle-database",
    "table-registry-pattern",
    "transactions",
    "migrations",
    "db-info",
    "debugging"
  ]
}
```

Create `apps/docs/content/docs/js-client/meta.json`:

```json
{
  "title": "JS Client",
  "pages": [
    "overview",
    "create-sync-client",
    "sync-commands",
    "polling",
    "local-write-helpers",
    "bulk-mutations",
    "error-handling",
    "testing"
  ]
}
```

Create `apps/docs/content/docs/tauri-plugin/meta.json`:

```json
{
  "title": "Tauri Plugin",
  "pages": [
    "overview",
    "installation",
    "builder",
    "commands",
    "migrations",
    "polling",
    "events",
    "host-testing"
  ]
}
```

Create `apps/docs/content/docs/server/meta.json`:

```json
{
  "title": "Server",
  "pages": [
    "overview",
    "route-shape",
    "status-handler",
    "pull-handler",
    "push-handler",
    "scope-resolution",
    "idempotency",
    "cursors",
    "drizzle-repository-helper",
    "low-level-primitives",
    "errors"
  ]
}
```

Create `apps/docs/content/docs/ui-frameworks/meta.json`:

```json
{
  "title": "UI Frameworks",
  "pages": [
    "overview",
    "react",
    "solid",
    "framework-agnostic-patterns"
  ]
}
```

Create `apps/docs/content/docs/sync-engine/meta.json`:

```json
{
  "title": "Sync Engine",
  "pages": [
    "overview",
    "sync-modes",
    "status-flow",
    "pull-flow",
    "push-flow",
    "chunking",
    "reconciliation",
    "cleanup"
  ]
}
```

Create `apps/docs/content/docs/protobuf/meta.json`:

```json
{
  "title": "Protobuf",
  "pages": [
    "overview",
    "generator-outputs",
    "typescript-runtime",
    "rust-mappers",
    "server-helpers",
    "json-compatibility"
  ]
}
```

Create `apps/docs/content/docs/testing/meta.json`:

```json
{
  "title": "Testing",
  "pages": [
    "overview",
    "js-client-tests",
    "server-tests",
    "rust-core-simulation",
    "tauri-plugin-host-tests",
    "inventory-app-tests",
    "e2e-runbook"
  ]
}
```

Create `apps/docs/content/docs/operations/meta.json`:

```json
{
  "title": "Operations",
  "pages": [
    "overview",
    "versioning-contracts",
    "regenerating-artifacts",
    "managing-migrations",
    "resetting-local-db",
    "debugging-outbox",
    "debugging-cursors",
    "network-failures",
    "performance"
  ]
}
```

Create `apps/docs/content/docs/reference/meta.json`:

```json
{
  "title": "Reference",
  "pages": [
    "overview",
    "typescript-api",
    "rust-api",
    "generated-artifacts",
    "commands",
    "events",
    "errors",
    "glossary"
  ]
}
```

Create `apps/docs/content/docs/migration-guides/meta.json`:

```json
{
  "title": "Migration Guides",
  "pages": [
    "from-raw-tauri-sqlite",
    "from-manual-outbox-inserts",
    "from-interval-polling",
    "from-js-migrations",
    "from-primitive-server-repository"
  ]
}
```

**Step 3: Run docs source generation**

Run:

```bash
cd apps/docs
bun run types:check
```

Expected: fail because the `meta.json` files reference pages that do not exist yet.

**Step 4: Commit the navigation skeleton**

Do not commit yet if the missing pages cause the docs generator to fail. Keep changes staged mentally until Task 2 creates placeholder pages.

## Task 2: Add Placeholder Pages for Every Nav Item

**Files:**

- Create every `.mdx` page referenced by the new `meta.json` files.

**Step 1: Create a page template**

Use this exact placeholder shape for each new file:

```mdx
---
title: Page Title
description: TODO
---

TODO: Write this page.
```

Example for `apps/docs/content/docs/getting-started/introduction.mdx`:

```mdx
---
title: Introduction
description: Start here when integrating Baresync into a Tauri app.
---

TODO: Write this page.
```

**Step 2: Create all placeholder files**

Create these files:

```txt
apps/docs/content/docs/getting-started/introduction.mdx
apps/docs/content/docs/getting-started/install.mdx
apps/docs/content/docs/getting-started/first-sync-contract.mdx
apps/docs/content/docs/getting-started/generate-artifacts.mdx
apps/docs/content/docs/getting-started/register-tauri-plugin.mdx
apps/docs/content/docs/getting-started/query-sqlite.mdx
apps/docs/content/docs/getting-started/write-local-changes.mdx
apps/docs/content/docs/getting-started/add-server-routes.mdx
apps/docs/content/docs/getting-started/run-sync.mdx
apps/docs/content/docs/getting-started/troubleshooting-first-run.mdx
apps/docs/content/docs/schema/overview.mdx
apps/docs/content/docs/schema/synced-tables.mdx
apps/docs/content/docs/schema/local-sync-columns.mdx
apps/docs/content/docs/schema/api-sync-columns.mdx
apps/docs/content/docs/schema/runtime-tables.mdx
apps/docs/content/docs/schema/table-helpers.mdx
apps/docs/content/docs/schema/diagnostics.mdx
apps/docs/content/docs/generator/overview.mdx
apps/docs/content/docs/generator/define-sync-config.mdx
apps/docs/content/docs/generator/define-protobuf-sync-config.mdx
apps/docs/content/docs/generator/cli.mdx
apps/docs/content/docs/generator/generated-files.mdx
apps/docs/content/docs/generator/protobuf-workspace.mdx
apps/docs/content/docs/generator/diagnostics.mdx
apps/docs/content/docs/local-database/overview.mdx
apps/docs/content/docs/local-database/create-tauri-drizzle-database.mdx
apps/docs/content/docs/local-database/table-registry-pattern.mdx
apps/docs/content/docs/local-database/transactions.mdx
apps/docs/content/docs/local-database/migrations.mdx
apps/docs/content/docs/local-database/db-info.mdx
apps/docs/content/docs/local-database/debugging.mdx
apps/docs/content/docs/js-client/overview.mdx
apps/docs/content/docs/js-client/create-sync-client.mdx
apps/docs/content/docs/js-client/sync-commands.mdx
apps/docs/content/docs/js-client/polling.mdx
apps/docs/content/docs/js-client/local-write-helpers.mdx
apps/docs/content/docs/js-client/bulk-mutations.mdx
apps/docs/content/docs/js-client/error-handling.mdx
apps/docs/content/docs/js-client/testing.mdx
apps/docs/content/docs/tauri-plugin/overview.mdx
apps/docs/content/docs/tauri-plugin/installation.mdx
apps/docs/content/docs/tauri-plugin/builder.mdx
apps/docs/content/docs/tauri-plugin/commands.mdx
apps/docs/content/docs/tauri-plugin/migrations.mdx
apps/docs/content/docs/tauri-plugin/polling.mdx
apps/docs/content/docs/tauri-plugin/events.mdx
apps/docs/content/docs/tauri-plugin/host-testing.mdx
apps/docs/content/docs/server/overview.mdx
apps/docs/content/docs/server/route-shape.mdx
apps/docs/content/docs/server/status-handler.mdx
apps/docs/content/docs/server/pull-handler.mdx
apps/docs/content/docs/server/push-handler.mdx
apps/docs/content/docs/server/scope-resolution.mdx
apps/docs/content/docs/server/idempotency.mdx
apps/docs/content/docs/server/cursors.mdx
apps/docs/content/docs/server/drizzle-repository-helper.mdx
apps/docs/content/docs/server/low-level-primitives.mdx
apps/docs/content/docs/server/errors.mdx
apps/docs/content/docs/ui-frameworks/overview.mdx
apps/docs/content/docs/ui-frameworks/react.mdx
apps/docs/content/docs/ui-frameworks/solid.mdx
apps/docs/content/docs/ui-frameworks/framework-agnostic-patterns.mdx
apps/docs/content/docs/sync-engine/overview.mdx
apps/docs/content/docs/sync-engine/sync-modes.mdx
apps/docs/content/docs/sync-engine/status-flow.mdx
apps/docs/content/docs/sync-engine/pull-flow.mdx
apps/docs/content/docs/sync-engine/push-flow.mdx
apps/docs/content/docs/sync-engine/chunking.mdx
apps/docs/content/docs/sync-engine/reconciliation.mdx
apps/docs/content/docs/sync-engine/cleanup.mdx
apps/docs/content/docs/protobuf/overview.mdx
apps/docs/content/docs/protobuf/generator-outputs.mdx
apps/docs/content/docs/protobuf/typescript-runtime.mdx
apps/docs/content/docs/protobuf/rust-mappers.mdx
apps/docs/content/docs/protobuf/server-helpers.mdx
apps/docs/content/docs/protobuf/json-compatibility.mdx
apps/docs/content/docs/testing/overview.mdx
apps/docs/content/docs/testing/js-client-tests.mdx
apps/docs/content/docs/testing/server-tests.mdx
apps/docs/content/docs/testing/rust-core-simulation.mdx
apps/docs/content/docs/testing/tauri-plugin-host-tests.mdx
apps/docs/content/docs/testing/inventory-app-tests.mdx
apps/docs/content/docs/testing/e2e-runbook.mdx
apps/docs/content/docs/operations/overview.mdx
apps/docs/content/docs/operations/versioning-contracts.mdx
apps/docs/content/docs/operations/regenerating-artifacts.mdx
apps/docs/content/docs/operations/managing-migrations.mdx
apps/docs/content/docs/operations/resetting-local-db.mdx
apps/docs/content/docs/operations/debugging-outbox.mdx
apps/docs/content/docs/operations/debugging-cursors.mdx
apps/docs/content/docs/operations/network-failures.mdx
apps/docs/content/docs/operations/performance.mdx
apps/docs/content/docs/reference/overview.mdx
apps/docs/content/docs/reference/typescript-api.mdx
apps/docs/content/docs/reference/rust-api.mdx
apps/docs/content/docs/reference/generated-artifacts.mdx
apps/docs/content/docs/reference/commands.mdx
apps/docs/content/docs/reference/events.mdx
apps/docs/content/docs/reference/errors.mdx
apps/docs/content/docs/reference/glossary.mdx
apps/docs/content/docs/migration-guides/from-raw-tauri-sqlite.mdx
apps/docs/content/docs/migration-guides/from-manual-outbox-inserts.mdx
apps/docs/content/docs/migration-guides/from-interval-polling.mdx
apps/docs/content/docs/migration-guides/from-js-migrations.mdx
apps/docs/content/docs/migration-guides/from-primitive-server-repository.mdx
```

**Step 3: Verify placeholders compile**

Run:

```bash
cd apps/docs
bun run types:check
bun run build
```

Expected: both pass.

**Step 4: Commit**

```bash
git add apps/docs/content/docs
git commit -m "docs: add documentation sitemap skeleton"
```

## Task 3: Write the Documentation Style Guide Page

**Files:**

- Create: `apps/docs/content/docs/reference/writing-docs.mdx`
- Modify: `apps/docs/content/docs/reference/meta.json`

**Step 1: Add page to reference meta**

Update `apps/docs/content/docs/reference/meta.json`:

```json
{
  "title": "Reference",
  "pages": [
    "overview",
    "typescript-api",
    "rust-api",
    "generated-artifacts",
    "commands",
    "events",
    "errors",
    "glossary",
    "writing-docs"
  ]
}
```

**Step 2: Write the docs style guide**

Create `apps/docs/content/docs/reference/writing-docs.mdx`:

```mdx
---
title: Writing Docs
description: How Baresync docs should explain sync behavior clearly.
---

# Writing Baresync Docs

Good Baresync docs should help a reader build a correct local-first Tauri app without guessing where sync bookkeeping lives.

## Page shape

Each guide page should answer these questions:

1. What problem does this page solve?
2. Which package or crate does it use?
3. What code should the reader copy?
4. What should the reader not do?
5. How can the reader verify it works?

## Prefer concrete app shapes

Use code from `examples/inventory-json-polling` when possible. If a snippet is simplified, say so.

## Be explicit about ownership

Baresync owns:

- local SQLite proxy commands
- local sync outbox helpers
- sync command shape
- generated table ordering
- push, pull, status envelope helpers
- Tauri plugin polling and event emission

The app owns:

- authorization
- scope resolution
- backend persistence rules
- UI error handling
- domain-specific validation
- deciding whether hard deletes are allowed

## Avoid unsupported promises

Do not say Baresync is:

- a hosted sync service
- a generic ORM
- a generic SQLite plugin
- a database-agnostic sync engine
- a full conflict-free replicated data type system

## Required verification

After changing docs, run:

```bash
cd apps/docs
bun run types:check
bun run build
```

From the repo root, also run:

```bash
bun x ultracite check
bun run typecheck
```
```

**Step 3: Verify**

Run:

```bash
cd apps/docs
bun run types:check
bun run build
```

Expected: PASS.

**Step 4: Commit**

```bash
git add apps/docs/content/docs/reference
git commit -m "docs: document Baresync writing standards"
```

## Task 4: Rewrite the Getting Started Path

**Files:**

- Modify: `apps/docs/content/docs/quickstart.mdx`
- Modify: `apps/docs/content/docs/getting-started/introduction.mdx`
- Modify: `apps/docs/content/docs/getting-started/install.mdx`
- Modify: `apps/docs/content/docs/getting-started/first-sync-contract.mdx`
- Modify: `apps/docs/content/docs/getting-started/generate-artifacts.mdx`
- Modify: `apps/docs/content/docs/getting-started/register-tauri-plugin.mdx`
- Modify: `apps/docs/content/docs/getting-started/query-sqlite.mdx`
- Modify: `apps/docs/content/docs/getting-started/write-local-changes.mdx`
- Modify: `apps/docs/content/docs/getting-started/add-server-routes.mdx`
- Modify: `apps/docs/content/docs/getting-started/run-sync.mdx`
- Modify: `apps/docs/content/docs/getting-started/troubleshooting-first-run.mdx`

**Step 1: Update `quickstart.mdx` to be a short hub**

Use this structure:

```mdx
---
title: Quickstart
description: Build the smallest useful Baresync integration path.
icon: Rocket
---

# Quickstart

This path gets a Tauri app syncing local SQLite rows with an app-owned backend.

Follow these steps:

1. Define local and API synced tables.
2. Generate the sync contract.
3. Register the Tauri plugin.
4. Query SQLite through the plugin.
5. Write local changes through the JS sync client.
6. Add server push, pull, and status routes.
7. Start polling or call `syncNow`.

For a runnable fullstack example, start with `examples/inventory-json-polling`.
```

**Step 2: Write install page**

`apps/docs/content/docs/getting-started/install.mdx` must include:

```bash
bun add baresync
```

And Rust dependency guidance:

```toml
[dependencies]
baresync-core = "0.1.0"
tauri-plugin-baresync = "0.1.0"
```

If packages are not published yet, add a note:

```mdx
Inside this repository, examples use workspace and path dependencies. Replace these with published versions when consuming Baresync from another repository.
```

**Step 3: Write first sync contract page**

Include local schema:

```ts
import { localSyncColumns } from "baresync/schema";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const locations = sqliteTable("locations", {
  id: text("id").primaryKey(),
  scopeId: text("scope_id").notNull(),
  name: text("name").notNull(),
  ...localSyncColumns(),
});
```

Include API schema:

```ts
import { apiSyncColumns } from "baresync/schema";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const locations = sqliteTable("locations", {
  id: text("id").primaryKey(),
  scopeId: text("scope_id").notNull(),
  name: text("name").notNull(),
  ...apiSyncColumns(),
});
```

Explain:

- local schema uses `localSyncColumns`
- API schema uses `apiSyncColumns`
- every synced table needs text `id`
- scope column is app-defined

**Step 4: Write generate artifacts page**

Use:

```ts
import { defineSyncConfig } from "baresync/generator";
import * as apiSyncedSchema from "./src/api-synced-schema";
import * as localSyncedSchema from "./src/local-synced-schema";

export const syncGeneratorConfig = defineSyncConfig({
  apiSyncedSchema,
  localSyncedSchema,
  outputDir: "./generated",
  packageName: "example.sync.v1",
  tables: {
    locations: { scope: "scope_id" },
  },
});
```

Commands:

```bash
bunx baresync doctor
bunx baresync generate
```

**Step 5: Write plugin registration page**

Use Rust snippet based on `examples/inventory-json-polling/apps/app/src-tauri/src/lib.rs`:

```rust
use tauri_plugin_baresync::builder::Builder as BaresyncBuilder;

tauri::Builder::default()
    .plugin(
        BaresyncBuilder::new()
            .api_base_url("http://127.0.0.1:18181")
            .encoding("json")
            .db_path("baresync.db")
            .contract_tables(sync_tables())
            .migrations(inventory_migrations())
            .poll_interval_secs(30)
            .build(),
    );
```

Explain that plugin setup applies migrations before JS commands use `PluginState`.

**Step 6: Write query SQLite page**

Use:

```ts
import { createTauriDrizzleDatabase } from "baresync/db";
import { invoke } from "@tauri-apps/api/core";
import { locations, syncCursors, syncOutbox } from "./schema";

export const TABLE = {
  locations,
  syncCursors,
  syncOutbox,
};

export const db = createTauriDrizzleDatabase({
  schema: TABLE,
  invoke,
});
```

Explain that `TABLE` makes schema-origin table references explicit.

**Step 7: Write local changes page**

Use:

```ts
await client.writeTransaction(db, async (tx) => {
  await client.writeLocalChange(tx, {
    table: TABLE.locations,
    rowId: locationId,
    operation: "insert",
    write: (writeTx) =>
      writeTx.insert(TABLE.locations).values({
        id: locationId,
        scopeId: "default",
        name: "Back room",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
  });
});
```

Include warning:

```mdx
`writeLocalChange` is a single-row helper. For bulk updates, query affected ids and call `enqueueChange` once per row inside the same transaction.
```

**Step 8: Write server routes page**

Use the handler factory pattern:

```ts
import {
  createSyncPullHandler,
  createSyncPushHandler,
  createSyncStatusHandler,
} from "baresync/server";
```

Explain `resolveScope`, `applyPushChanges`, `loadPullChanges`, and `loadSyncStatus`.

**Step 9: Write run sync page**

Use:

```ts
import { createSyncClient } from "baresync/tauri";
import { invoke } from "@tauri-apps/api/core";

const client = createSyncClient({
  apiUrl: "http://127.0.0.1:18181",
  encoding: "json",
  scopeId: "default",
  invoke,
});

await client.startPolling();
```

Mention manual:

```ts
await client.syncNow();
```

**Step 10: Verify**

Run:

```bash
cd apps/docs
bun run types:check
bun run build
```

Expected: PASS.

**Step 11: Commit**

```bash
git add apps/docs/content/docs/quickstart.mdx apps/docs/content/docs/getting-started
git commit -m "docs: write getting started guide"
```

## Task 5: Write Schema and Generator Docs

**Files:**

- Modify all files under `apps/docs/content/docs/schema/`
- Modify all files under `apps/docs/content/docs/generator/`

**Step 1: Write schema overview**

Cover:

- paired local/API schemas
- synced table requirements
- local row state
- API row state
- runtime tables
- app-defined scope

**Step 2: Write `synced-tables.mdx`**

Include:

```ts
export const items = sqliteTable("items", {
  id: text("id").primaryKey(),
  scopeId: text("scope_id").notNull(),
  locationId: text("location_id").notNull().references(() => locations.id),
  name: text("name").notNull(),
  ...localSyncColumns(),
});
```

Explain foreign key table ordering.

**Step 3: Write `runtime-tables.mdx`**

Explain:

- `sync_outbox`
- `sync_cursors`
- `sync_batch_requests`

Mention where they belong:

- local app DB: `sync_outbox`, `sync_cursors`
- server DB: `sync_batch_requests`

**Step 4: Write `table-helpers.mdx`**

Document:

```ts
createSyncOutboxTable()
createSyncCursorsTable()
createSyncBatchRequestsTable()
```

Show custom name example only if the helper supports it. If not, keep the default table names only.

**Step 5: Write generator overview and CLI pages**

Document:

```bash
bunx baresync doctor
bunx baresync generate
```

Explain:

- diagnostics before generation
- table order
- manifest drift
- protobuf optional outputs

**Step 6: Verify**

Run:

```bash
cd apps/docs
bun run types:check
bun run build
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/docs/content/docs/schema apps/docs/content/docs/generator
git commit -m "docs: document schema helpers and generator"
```

## Task 6: Write Local Database and JS Client Docs

**Files:**

- Modify all files under `apps/docs/content/docs/local-database/`
- Modify all files under `apps/docs/content/docs/js-client/`

**Step 1: Write local database overview**

Cover:

- plugin-owned SQLite
- Drizzle sqlite-proxy
- Tauri command bridge
- single connection transaction safety

**Step 2: Write `create-tauri-drizzle-database.mdx`**

Use:

```ts
import { invoke } from "@tauri-apps/api/core";
import { createTauriDrizzleDatabase } from "baresync/db";
import { TABLE } from "./db";

export const db = createTauriDrizzleDatabase({
  schema: TABLE,
  invoke,
});
```

State: no local type assertion is needed for Tauri `invoke`.

**Step 3: Write `transactions.mdx`**

Explain:

- use Drizzle `db.transaction`
- local writes should use `client.writeTransaction`
- row mutation and outbox enqueue must be atomic

**Step 4: Write `migrations.mdx`**

Document both plugin APIs:

```rust
.migrations(inventory_migrations())
.migrations_dir(PathBuf::from("migrations"))
```

Explain recommended packaged-app pattern:

- build script discovers migration directory
- generated Rust function returns embedded `EmbeddedMigration`
- plugin setup applies migrations automatically

**Step 5: Write JS client overview**

List methods:

```txt
syncNow
push
pull
fullResync
getState
startPolling
stopPolling
pausePolling
resumePolling
getPollingStatus
writeTransaction
writeLocalChange
enqueueChange
```

**Step 6: Write local write helpers page**

Use the seed example from `examples/inventory-json-polling/apps/app/src/components/SeedPanel.tsx`.

Include bulk update pattern:

```ts
await client.writeTransaction(db, async (tx) => {
  const rows = await tx
    .select({ id: TABLE.items.id })
    .from(TABLE.items)
    .where(eq(TABLE.items.locationId, locationId));

  await tx
    .update(TABLE.items)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(TABLE.items.locationId, locationId));

  for (const row of rows) {
    await client.enqueueChange(tx, {
      table: TABLE.items,
      rowId: row.id,
      operation: "update",
    });
  }
});
```

**Step 7: Verify**

Run:

```bash
cd apps/docs
bun run types:check
bun run build
```

Expected: PASS.

**Step 8: Commit**

```bash
git add apps/docs/content/docs/local-database apps/docs/content/docs/js-client
git commit -m "docs: document local database and JS client"
```

## Task 7: Write Tauri Plugin and Sync Engine Docs

**Files:**

- Modify all files under `apps/docs/content/docs/tauri-plugin/`
- Modify all files under `apps/docs/content/docs/sync-engine/`

**Step 1: Write Tauri plugin overview**

Cover:

- plugin setup
- SQLite pool
- migration startup
- sync engine config
- command surface
- event emission

**Step 2: Write builder page**

Document:

```rust
api_base_url
encoding
max_push_bytes
max_push_rows
db_path
contract_tables
migrations
migrations_dir
poll_interval_secs
poll_on_background
```

**Step 3: Write command reference page**

List command names and argument shapes:

```txt
run_sql({ query })
run_sql_batch({ statements })
run_migrations()
get_migration_status()
get_db_info()
sync_now({ scopeId })
sync_push({ scopeId })
sync_pull({ scopeId })
sync_full_resync({ scopeId })
get_sync_local_state({ scopeId })
purge_synced_outbox({ olderThan })
run_garbage_collection({ scopeId })
start_polling({ scopeId })
stop_polling()
pause_polling()
resume_polling()
get_polling_status()
```

**Step 4: Write events page**

Document:

```txt
baresync://data-changed
baresync://sync-status-changed
```

Explain:

- `data-changed` emits only when local observable data changes
- SQL emits only when `rows_affected > 0`
- status event is for sync or polling status changes

**Step 5: Write sync engine pages**

Cover:

- `NoOp`
- `PushOnly`
- `PullOnly`
- `FullSync`
- `FullResync`
- status flow
- pull flow
- push flow
- chunking
- server-wins reconciliation

**Step 6: Verify**

Run:

```bash
cd apps/docs
bun run types:check
bun run build
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/docs/content/docs/tauri-plugin apps/docs/content/docs/sync-engine
git commit -m "docs: document Tauri plugin and sync engine"
```

## Task 8: Write Server Docs

**Files:**

- Modify all files under `apps/docs/content/docs/server/`

**Step 1: Write server overview**

State clearly:

- Baresync does not own auth
- Baresync does not own tenant policy
- Baresync does not own app persistence rules
- Baresync does provide route shape, decoding, limits, ordering, idempotency, and handler factories

**Step 2: Write route shape page**

Document routes:

```txt
POST /sync/status
POST /sync/pull
POST /sync/push
```

**Step 3: Write handler pages**

For `status`, `pull`, and `push`, show handler factory usage:

```ts
createSyncStatusHandler(...)
createSyncPullHandler(...)
createSyncPushHandler(...)
```

**Step 4: Write scope resolution page**

Use:

```ts
async function resolveScope({ context, scopeId }) {
  const scope = await authorizeScope(context.session, scopeId);
  if (!scope) {
    return { ok: false, status: 403, body: { error: "forbidden" } };
  }
  return { ok: true, scope };
}
```

**Step 5: Write Drizzle repository helper page**

Reference inventory example:

```txt
examples/inventory-json-polling/apps/server/src/db/drizzle-helper/sync-repository.ts
```

Explain what the helper does and what remains app-owned.

**Step 6: Verify**

Run:

```bash
cd apps/docs
bun run types:check
bun run build
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/docs/content/docs/server
git commit -m "docs: document server integration"
```

## Task 9: Write UI Framework Docs for React and SolidJS

**Files:**

- Modify: `apps/docs/content/docs/ui-frameworks/overview.mdx`
- Modify: `apps/docs/content/docs/ui-frameworks/react.mdx`
- Modify: `apps/docs/content/docs/ui-frameworks/solid.mdx`
- Modify: `apps/docs/content/docs/ui-frameworks/framework-agnostic-patterns.mdx`

**Step 1: Write UI framework overview**

Explain:

- Baresync is framework-agnostic at the command and DB layer
- UI frameworks need a provider or singleton for the sync client
- reads should be invalidated from plugin events
- writes should use `writeTransaction`

**Step 2: Write React page**

Use current inventory app pattern:

```ts
export function SyncClientProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [client] = useState(() =>
    createSyncClient({
      apiUrl: "http://127.0.0.1:18181",
      encoding: "json",
      scopeId: "default",
      invoke,
    })
  );

  useEffect(() => {
    client.startPolling();
    return () => {
      client.stopPolling().catch(() => {});
    };
  }, [client]);

  useEffect(() => {
    const pending = Promise.all([
      listen("baresync://data-changed", async () => {
        await queryClient.invalidateQueries({ queryKey: ["inventory"] });
        await queryClient.invalidateQueries({ queryKey: ["sync-state"] });
      }),
      listen("baresync://sync-status-changed", async () => {
        await queryClient.invalidateQueries({ queryKey: ["sync-state"] });
      }),
    ]);

    return () => {
      pending.then(([unlistenData, unlistenStatus]) => {
        unlistenData();
        unlistenStatus();
      });
    };
  }, [queryClient]);

  return <SyncClientContext.Provider value={client}>{children}</SyncClientContext.Provider>;
}
```

If JSX in docs formatting conflicts with MDX, wrap the snippet in a fenced code block.

**Step 3: Write SolidJS page**

Use Solid Query and Solid context. Add package note:

```bash
bun add @tanstack/solid-query
```

Use this snippet:

```tsx
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/solid-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createSyncClient, type SyncClient } from "baresync/tauri";
import {
  createContext,
  createSignal,
  onCleanup,
  onMount,
  type ParentProps,
  useContext,
} from "solid-js";

const SyncClientContext = createContext<SyncClient>();

export function BaresyncProvider(props: ParentProps) {
  const queryClient = useQueryClient();
  const [client] = createSignal(
    createSyncClient({
      apiUrl: "http://127.0.0.1:18181",
      encoding: "json",
      scopeId: "default",
      invoke,
    })
  );

  onMount(() => {
    client().startPolling();
  });

  onMount(() => {
    const cleanup = Promise.all([
      listen("baresync://data-changed", async () => {
        await queryClient.invalidateQueries({ queryKey: ["inventory"] });
        await queryClient.invalidateQueries({ queryKey: ["sync-state"] });
      }),
      listen("baresync://sync-status-changed", async () => {
        await queryClient.invalidateQueries({ queryKey: ["sync-state"] });
      }),
    ]);

    onCleanup(() => {
      cleanup.then(([unlistenData, unlistenStatus]) => {
        unlistenData();
        unlistenStatus();
      });
    });
  });

  onCleanup(() => {
    client().stopPolling().catch(() => {});
  });

  return (
    <SyncClientContext.Provider value={client()}>
      {props.children}
    </SyncClientContext.Provider>
  );
}

export function useSyncClient() {
  const client = useContext(SyncClientContext);
  if (!client) {
    throw new Error("useSyncClient must be used inside BaresyncProvider");
  }
  return client;
}

export function AppRoot() {
  const queryClient = new QueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <BaresyncProvider>
        <App />
      </BaresyncProvider>
    </QueryClientProvider>
  );
}
```

Then show a Solid query:

```tsx
import { createQuery } from "@tanstack/solid-query";
import { desc } from "drizzle-orm";
import { db, TABLE } from "./db";

export function useLocations() {
  return createQuery(() => ({
    queryKey: ["inventory", "locations"],
    queryFn: async () =>
      db.select().from(TABLE.locations).orderBy(desc(TABLE.locations.updatedAt)),
  }));
}
```

Then show a Solid mutation:

```tsx
const client = useSyncClient();

await client.writeTransaction(db, async (tx) => {
  await client.writeLocalChange(tx, {
    table: TABLE.locations,
    rowId: locationId,
    operation: "insert",
    write: (writeTx) =>
      writeTx.insert(TABLE.locations).values({
        id: locationId,
        scopeId: "default",
        name: "Back room",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
  });
});
```

**Step 4: Write framework-agnostic page**

List the portable pattern:

1. Create one sync client per app shell.
2. Start polling on mount.
3. Stop polling on cleanup.
4. Listen for plugin events.
5. Invalidate local read caches from events.
6. Wrap local writes in `writeTransaction`.

**Step 5: Verify**

Run:

```bash
cd apps/docs
bun run types:check
bun run build
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/docs/content/docs/ui-frameworks
git commit -m "docs: add React and SolidJS integration guides"
```

## Task 10: Write Examples Docs

**Files:**

- Modify: `apps/docs/content/docs/examples.mdx`
- Create: `apps/docs/content/docs/examples/meta.json`
- Create: `apps/docs/content/docs/examples/inventory-json-polling.mdx`
- Create: `apps/docs/content/docs/examples/minimal-tauri-app.mdx`
- Create: `apps/docs/content/docs/examples/local-write-form.mdx`
- Create: `apps/docs/content/docs/examples/bulk-mutation.mdx`
- Create: `apps/docs/content/docs/examples/soft-delete.mdx`
- Create: `apps/docs/content/docs/examples/solid-query.mdx`

**Step 1: Convert examples into a section**

If Fumadocs supports both `examples.mdx` and `examples/`, keep `examples.mdx` as the section landing page and add:

```json
{
  "title": "Examples",
  "pages": [
    "inventory-json-polling",
    "minimal-tauri-app",
    "local-write-form",
    "bulk-mutation",
    "soft-delete",
    "solid-query"
  ]
}
```

If the docs source dislikes same-name page and folder, rename the landing page to `apps/docs/content/docs/examples/index.mdx` and update root `meta.json` accordingly.

**Step 2: Write inventory example page**

Cover:

- workspace layout
- app/server/contract responsibilities
- React Query app
- provider-owned event invalidation
- `TABLE` registry
- build-time migration discovery
- local writes
- server primitive vs helper paths

**Step 3: Write minimal Tauri app example**

Show only:

- plugin registration
- `createTauriDrizzleDatabase`
- `createSyncClient`
- `client.startPolling`

**Step 4: Write Solid Query example**

Reuse the shorter Solid snippets from Task 9.

**Step 5: Verify**

Run:

```bash
cd apps/docs
bun run types:check
bun run build
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/docs/content/docs/examples.mdx apps/docs/content/docs/examples
git commit -m "docs: expand examples section"
```

## Task 11: Write Testing and Operations Docs

**Files:**

- Modify all files under `apps/docs/content/docs/testing/`
- Modify all files under `apps/docs/content/docs/operations/`

**Step 1: Read E2E runbook before writing E2E docs**

Run:

```bash
sed -n '1,260p' openspec/knowledge/E2E-TESTING-RUNBOOK.md
```

Expected: understand desktop/Android fixture boundaries before writing.

**Step 2: Write testing overview**

Cover:

- TypeScript package tests
- Rust core simulation
- Tauri plugin host tests
- inventory app tests
- fixture/E2E testing

**Step 3: Write exact commands**

Include:

```bash
bun x ultracite check
bun run typecheck
cargo test -p baresync-core
cargo test -p tauri-plugin-baresync
cd examples/inventory-json-polling/apps/app && bun run test
cd apps/docs && bun run types:check && bun run build
```

**Step 4: Write operations pages**

Cover:

- regenerating artifacts
- managing migrations
- resetting local DB
- inspecting `sync_outbox`
- inspecting `sync_cursors`
- network failure behavior
- performance and push chunking

**Step 5: Verify**

Run:

```bash
cd apps/docs
bun run types:check
bun run build
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/docs/content/docs/testing apps/docs/content/docs/operations
git commit -m "docs: document testing and operations"
```

## Task 12: Write API Reference Docs

**Files:**

- Modify all files under `apps/docs/content/docs/reference/`

**Step 1: Write TypeScript API reference**

Group by export path:

```txt
baresync/schema
baresync/generator
baresync/db
baresync/tauri
baresync/server
baresync/server/drizzle
baresync/limits
```

For each path, list key exports from current source files.

**Step 2: Write Rust API reference**

Group by crate:

```txt
baresync-core
tauri-plugin-baresync
```

Mention public areas:

- engine
- migrations
- db
- drizzle proxy
- push/pull/status
- plugin builder
- commands
- polling

**Step 3: Write generated artifacts reference**

Cover:

- `sync-contract.json`
- `sync-table-order.ts`
- `sync-contract.manifest.json`
- protobuf outputs
- Rust mapper output

**Step 4: Write commands reference**

Use command list from Task 7 and include arguments and return shape summaries.

**Step 5: Write events reference**

Document:

```txt
baresync://data-changed
baresync://sync-status-changed
```

**Step 6: Write glossary**

Include:

- scope id
- local row state
- API row state
- outbox
- cursor
- baseline
- full resync
- server wins
- idempotency key
- table order
- local-only column
- server-only column

**Step 7: Verify**

Run:

```bash
cd apps/docs
bun run types:check
bun run build
```

Expected: PASS.

**Step 8: Commit**

```bash
git add apps/docs/content/docs/reference
git commit -m "docs: add API reference pages"
```

## Task 13: Write Migration Guides

**Files:**

- Modify all files under `apps/docs/content/docs/migration-guides/`

**Step 1: Write from raw Tauri SQLite guide**

Explain:

- replace direct SQLite plugin calls with `createTauriDrizzleDatabase`
- register `tauri-plugin-baresync`
- keep app queries in Drizzle

**Step 2: Write from manual outbox inserts guide**

Explain before:

```ts
await tx.insert(syncOutbox).values(...);
```

Explain after:

```ts
await client.writeLocalChange(tx, {
  table: TABLE.items,
  rowId,
  operation: "update",
  write: (writeTx) => writeTx.update(TABLE.items).set(values).where(eq(TABLE.items.id, rowId)),
});
```

**Step 3: Write from interval polling guide**

Explain:

- remove `setInterval`
- listen to plugin events
- invalidate query keys
- start plugin polling through `client.startPolling`

**Step 4: Write from JS migrations guide**

Explain:

- do not call `run_migrations` from JS startup
- configure migrations in Rust plugin
- embed migration directory through build script for packaged apps

**Step 5: Write from primitive server repository guide**

Explain:

- keep app validation and scope logic
- move common cursor/pull/push table mechanics to `baresync/server/drizzle`

**Step 6: Verify**

Run:

```bash
cd apps/docs
bun run types:check
bun run build
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/docs/content/docs/migration-guides
git commit -m "docs: add migration guides"
```

## Task 14: Final Docs Review Pass

**Files:**

- Review all files under `apps/docs/content/docs/`

**Step 1: Search for stale snippets**

Run:

```bash
rg "invoke as|useBaresyncEventBridge|attachBaresyncEventBridge|setInterval|run_migrations" apps/docs/content/docs -n
```

Expected:

- no `invoke as` snippets
- no separate `useBaresyncEventBridge` app setup snippets
- no interval polling recommended for normal inventory reads
- `run_migrations` only documented as command/reference/diagnostic, not JS startup

**Step 2: Search for unsupported claims**

Run:

```bash
rg "hosted sync|database-agnostic|CRDT|automatic conflict resolution|hard delete" apps/docs/content/docs -n
```

Expected:

- unsupported claims are absent or explicitly negated
- hard delete is described as outside the common documented path

**Step 3: Run full docs verification**

Run:

```bash
cd apps/docs
bun run types:check
bun run build
```

Expected: PASS.

**Step 4: Run repo verification**

Run:

```bash
bun x ultracite check
bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/docs/content/docs
git commit -m "docs: polish Baresync documentation"
```

## Task 15: Optional Screenshots and Visual Diagrams

**Files:**

- Modify: selected MDX pages under `apps/docs/content/docs/`

**Step 1: Add Mermaid diagrams where they clarify flow**

Recommended diagrams:

- `architecture.mdx`: system map
- `sync-engine/sync-modes.mdx`: mode decision tree
- `tauri-plugin/events.mdx`: event invalidation flow
- `local-database/migrations.mdx`: build-time migration discovery flow
- `server/route-shape.mdx`: request path from client to server handler

**Step 2: Verify Mermaid renders**

Run:

```bash
cd apps/docs
bun run build
```

Expected: PASS.

**Step 3: Commit**

```bash
git add apps/docs/content/docs
git commit -m "docs: add sync flow diagrams"
```

## Final Verification Checklist

Run:

```bash
cd apps/docs
bun run types:check
bun run build
```

Expected:

- Fumadocs source generation succeeds.
- TypeScript succeeds.
- Waku build succeeds.

Run from repo root:

```bash
bun x ultracite check
bun run typecheck
```

Expected:

- Ultracite reports no errors.
- Package typecheck passes.

Optional deeper verification:

```bash
cargo check -p tauri-plugin-baresync
cd examples/inventory-json-polling/apps/app && bun run test
```

Expected:

- Rust plugin still compiles.
- Inventory app tests still pass.

