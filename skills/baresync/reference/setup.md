# Setup

Two paths: greenfield (scaffold) or brownfield (add to existing project).

If the exact wiring or file layout is unclear, load `reference/source.md` and inspect the mapped workspace source instead of guessing.

## Prerequisites

Baresync requires all of these. If any don't match, it's not the right tool:

- **Tauri 2.x desktop app** — baresync is a Tauri plugin. No web, mobile, or Electron.
- **JavaScript/TypeScript server** — handler factories are npm packages. Rust, Python, Go backends not supported.
- **Drizzle ORM on the server** — `createDrizzleSyncRepository` is Drizzle-specific. Prisma, TypeORM, Kysely not supported.
- **Bun 1.2+**, **Rust stable**, **Tauri CLI 2.x**

## Greenfield

### Scaffold

```bash
npx create-baresync
```

Prompts for project name and server framework (Hono or Elysia). Then:

```bash
bun run generate:sync
bun run migrate:local && bun run migrate:server
bun run dev
```

The scaffold is a starting point. The directory layout is recommended, not required.

## Brownfield

Do not restructure the project. Scan for the essential pieces and fill what's missing.

### Step 1: Install packages

**Tauri app** — add to Cargo.toml and package.json:

```toml
# src-tauri/Cargo.toml
tauri-plugin-baresync = "0.2.5"
env_logger = "0.11"
```

```json
// apps/app/package.json
"baresync": "^0.2.5",
"drizzle-orm": "^0.45.2"
```

**Server** — add to package.json:

```json
"baresync": "^0.2.5",
"drizzle-orm": "^0.45.2"
```

### Step 2: Create `SYNC_SCOPE` constant

One file, one export. Both client and server import it.

```ts
export const SYNC_SCOPE = "default";
```

This is the only constant that needs to be shared. Table names are defined by the Drizzle schema objects — no string constants needed.

### Step 3: Create schemas

Four Drizzle schema files are needed — two synced (domain tables) and two infrastructure (sync engine tables).

#### Synced schemas (paired)

Define the same tables on both sides. Same table names, same business columns, different sync metadata.

**Server side** (`api-synced-schema.ts`):

```ts
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { apiSyncColumns } from "baresync/schema";

export const items = sqliteTable("items", {
  id: text("id").primaryKey(),
  scopeId: text("scope_id").notNull(),
  name: text("name").notNull(),
  ...apiSyncColumns(),
});
```

**Client side** (`local-synced-schema.ts`):

```ts
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { localSyncColumns } from "baresync/schema";

export const items = sqliteTable("items", {
  id: text("id").primaryKey(),
  scopeId: text("scope_id").notNull(),
  name: text("name").notNull(),
  ...localSyncColumns(),
});
```

#### Infrastructure schemas

**Client side** (`local-schema.ts`) — outbox + cursors:

```ts
import { createSyncOutboxTable, createSyncCursorsTable } from "baresync/schema";

export const syncOutbox = createSyncOutboxTable();
export const syncCursors = createSyncCursorsTable();
```

**Server side** (`api-schema.ts`) — batch request tracking:

```ts
import { createSyncBatchRequestsTable } from "baresync/schema";

export const syncBatchRequests = createSyncBatchRequestsTable();
```

Without these, the sync engine has nowhere to store pending changes, cursor state, or batch tracking.

### Step 4: Create `sync.config.ts`

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineSyncConfig } from "baresync/generator";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export const syncGeneratorConfig = defineSyncConfig({
  apiSyncedSchema: path.join(__dirname, "src", "api-synced-schema.ts"),
  localSyncedSchema: path.join(__dirname, "src", "local-synced-schema.ts"),
  outputDir: "./generated",
  tables: {
    items: { scopeColumn: "scope_id" },
  },
});
```

See [generator reference](generator.md) for full config parameters (`limits`, path-based schema inputs, table options defaults).

### Step 5: Create Drizzle configs + generate contract + migrations

Create the Drizzle config files so migrations know which tables to include.

**Local** (`drizzle.local.config.ts`) — infrastructure tables + your synced tables:

```ts
import type { Config } from "drizzle-kit";
import { syncCursors, syncOutbox } from "@sync-contract/local-schema";
// import your synced tables too

export default {
  dialect: "sqlite",
  schema: { syncCursors, syncOutbox /* + your tables */ },
  out: "./src-tauri/migrations",
  dbCredentials: { url: "./src-tauri/migrations/app.db" },
} satisfies Config;
```

**Server** (`drizzle.config.ts`) — infrastructure table:

```ts
import { defineConfig } from "drizzle-kit";
import { syncBatchRequests } from "@sync-contract/api-schema";

export default defineConfig({
  dialect: "sqlite",
  schema: { syncBatchRequests },
  out: "./drizzle",
  dbCredentials: { url: "./data/server.db" },
});
```

Then generate:

```bash
bun run generate:sync
bun run migrate:local    # local SQLite (outbox + cursors + synced tables)
bun run migrate:server   # server DB
```

See [generator reference](generator.md) for CLI flags (`--check`, `--output`, `--warnings-as-errors`).

### Step 6: Configure Tauri plugin

In `lib.rs`, add `env_logger` init before the plugin:

```rust
env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
    .init();
```

Then configure the plugin. You need to decide a few things:

**Polling:** Do you want automatic sync polling?

```rust
// Poll every 30 seconds (default)
.poll_interval_secs(30)

// Or disable polling entirely — user triggers sync manually
// (omit poll_interval_secs, or set to 0)
```

**Background polling:** Should polling continue when the app window is unfocused?

```rust
// false (default): pauses when window loses focus — saves resources on desktop
.poll_on_background(false)

// true: keeps polling in background — needed for background services or mobile
.poll_on_background(true)
```

**Database path:** Where to store the SQLite file?

```rust
// Default: relative path resolves under app data dir
.db_path("baresync.db")

// Custom: subdirectory or absolute path
.db_path("databases/myapp.db")
```

**Encryption:** Do you need encryption at rest?

```rust
// No encryption (default): plaintext SQLite
// (omit encryption_key_provider)

// With SQLCipher encryption: provide a key provider
.encryption_key_provider(MyKeyProvider)
```

Encryption requires the `sqlcipher` Cargo feature. The key provider gives the plugin a 32-byte key before migrations run. If you later enable encryption on an existing plaintext database, you must migrate or delete the old file first — it won't convert automatically.

**Full example:**

```rust
tauri::Builder::default()
    .plugin(
        BaresyncBuilder::new()
            .api_base_url("http://127.0.0.1:3001")
            .db_path("baresync.db")
            .contract_json(include_str!("../../../../packages/sync-contract/generated/sync-contract.json"))
            .migrations_path("migrations")
            .poll_interval_secs(30)
            .poll_on_background(false)
            .build(),
    )
    .run(generate_context!())
    .expect("failed to run app");
```

The `include_str!` path must point to the generated `sync-contract.json`. Update it after every `generate:sync`.

See [tauri-plugin reference](tauri-plugin.md) for full builder methods, all commands, migration options, and testing.

### Step 7: Set up client db helper

```ts
import { createTauriDrizzleDatabase } from "baresync/db";
import { items } from "@sync-contract/local-synced-schema";
import { syncCursors, syncOutbox } from "@sync-contract/local-schema";

export const TABLE = { items, syncCursors, syncOutbox };

export function createAppDatabase(invoke) {
  return createTauriDrizzleDatabase({ schema: TABLE, invoke });
}
```

`createTauriDrizzleDatabase` config options:

| Option | Purpose |
|---|---|
| `schema` | The TABLE object (required) |
| `invoke` | Tauri IPC function (required in app, mock for tests) |
| `commands` | Custom command name overrides (rarely needed) |
| `onQueryError` | Callback for logging/telemetry (error still throws after) |

### Step 8: Set up tsconfig path aliases

Both the app and server need path aliases so `@sync-contract/*` imports resolve. Add to both `tsconfig.json` files:

```json
{
  "compilerOptions": {
    "paths": {
      "@sync-contract/*": ["../../packages/sync-contract/src/*"],
      "@sync-contract/generated/*": ["../../packages/sync-contract/generated/*"]
    }
  }
}
```

Adjust the relative paths to match your project structure. Without these, imports like `@sync-contract/constants` and `@sync-contract/local-synced-schema` won't resolve.

### Step 9: Bundle migrations in Tauri

In `tauri.conf.json`, add `resources` so the app bundles migration SQL files:

```json
{
  "bundle": {
    "resources": ["migrations/*.sql"]
  }
}
```

Also add `beforeBuildCommand` / `beforeDevCommand` to regenerate the contract before each build:

```json
{
  "build": {
    "beforeBuildCommand": "bun run generate:sync",
    "beforeDevCommand": "bun run generate:sync"
  }
}
```

### Step 10: Set up server

See [server reference](server.md). Three files:

- `db/client.ts` — database connection
- `db/v1/sync-repository.ts` — 5 functions per table (`buildRow`, `readLatestRow`, `readRows`, `softDeleteRow`, `upsertRow`)
- `v1/routes.ts` — push/pull/status handlers

### Step 11: Wire up sync client

```ts
import { createSyncClient } from "baresync/tauri";
import { SYNC_SCOPE } from "@sync-contract/constants";

export function createAppSyncClient(invoke) {
  return createSyncClient({ scopeId: SYNC_SCOPE, invoke });
}
```

Wrap in a React provider with event listeners for cache invalidation. See [UI frameworks reference](ui-frameworks.md).

### Verify

```bash
RUST_LOG=debug bun run dev
```

Look for `[baresync] plugin setup` in terminal output.

## Next

- [UI frameworks](ui-frameworks.md) — wire the sync client into React, Solid, or any framework
- [Write reference](write.md) — local writes, outbox, transactions
- [Server reference](server.md) — routes, sync repository, scope resolution
- [Production](production.md) — environment-specific settings, SQLite config, monitoring, performance
