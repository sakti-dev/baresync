---
name: baresync
description: Use when user asks about baresync, local-first sync, outbox pattern, Tauri SQLite sync, paired schemas, sync contract, or reports sync issues, data conflicts, or database problems in a baresync project
---

# Baresync

Skill for working with Baresync — a local-first sync system for Tauri apps with SQLite.

## Operating Rules (MANDATORY)

These rules are binding for every Baresync task. Follow them before answering anything else.

1. Do not assume missing details. Read the relevant skill reference or workspace source first.
2. Prefer the workspace source of truth over `node_modules` or published-package copies.
3. If the skill or docs conflict with source code, trust the source code and treat the skill as stale.
4. If a reference does not fully answer the question, continue to the next deeper reference or source file instead of guessing.
5. Only ask the user a question when the answer cannot be determined from the workspace or the references.
6. Never silently substitute a nearby concept, command, or file when the exact one is available.
7. When instructions conflict, use this priority:
   - system
   - developer
   - workspace source code
   - skill references
   - user request

## Reliability Model

This skill is an operating manual, not a loose documentation index.

Use it in one of three modes:

- **Procedural mode** for setup, schema, generator, server, write, UI, testing, and production tasks.
- **Diagnostic mode** for errors, broken sync, missing generated files, stale contracts, and failed builds.
- **Exploration mode** for conceptual questions about how Baresync works.

Every mode must stay source-grounded. Read the narrowest matching reference first. If the reference is incomplete or conflicts with source, read the workspace source and trust source.

## Prompt Processing (MANDATORY)

Before doing anything:
1. Classify the user’s intent using `Intent Routing`.
2. Load the narrowest matching reference.
3. Answer only from the loaded reference if it fully covers the request.
4. If the reference is incomplete, read `reference/source.md` and inspect the mapped workspace source file.
5. If docs and source conflict, trust source, mention the mismatch, and continue from source.
6. If the answer still cannot be determined, ask one short clarifying question.

Do not answer Baresync API behavior from memory when a reference or workspace source file exists.

## Intent Routing

Users do not need to know command names. Route by intent.

| User intent | Examples | Load first | Then load if needed |
|---|---|---|---|
| Add Baresync to a project | "setup sync", "install baresync", "make my Tauri app sync" | `reference/setup.md` | `reference/source.md` |
| Write local synced data | "create item", "update local row", "delete synced data" | `reference/write.md` | `reference/source.md` |
| Change synced schema | "add a synced table", "add column", "schema mismatch" | `reference/schema.md` | `reference/generator.md`, `reference/source.md` |
| Generate contract/artifacts | "sync.config", "generated files", "doctor failed", "contract import broken" | `reference/generator.md` | `reference/debug.md`, `reference/source.md` |
| Build server sync API | "push handler", "pull handler", "repository", "scope auth" | `reference/server.md` | `reference/source.md` |
| Wire Tauri plugin | "lib.rs", "polling", "migrations", "plugin config" | `reference/tauri-plugin.md` | `reference/debug.md`, `reference/source.md` |
| Wire UI/framework | "React Query", "events", "invalidate", "Solid" | `reference/ui-frameworks.md` | `reference/source.md` |
| Debug broken sync | "not syncing", "outbox stuck", "missing data", error logs | `reference/debug.md` | `reference/verify.md`, `reference/source.md` |
| Verify an integration | "is this correct?", "review my sync setup", "check my Baresync app" | `reference/verify.md` | relevant area reference, `reference/source.md` |
| Explain API behavior | "what does this return?", "how does outbox work?", "what is localSyncColumns?" | `reference/query.md` | `reference/source.md` |
| Deep internals | "chunking", "idempotency", "transport", "watermark" | `reference/internals.md` | `reference/source.md` |
| Engine mechanics | "status flow", "retry split", "runtime tables", "cursor storage", "pull SQL" | `reference/internals.md` | `reference/source.md` |
| Production operation | "monitoring", "resync", "performance", "cleanup" | `reference/production.md` | `reference/debug.md`, `reference/source.md` |
| Testing strategy | "write tests", "mock invoke", "E2E" | `reference/testing.md` | workspace test files, `reference/source.md` |
| Skill maintenance | "skill fixtures", "route prompts", "stale docs" | `reference/prompt-fixtures.md` | `reference/source.md` |
| Auth headers, token refresh | "setHeaders", "auth token", "API key", "401", "403" | `reference/tauri-plugin.md` | `reference/ui-frameworks.md`, `reference/production.md` |

## Prerequisites

Baresync requires all of these:

- **Tauri 2.x desktop app** — baresync is a Tauri plugin. No web, mobile, or Electron.
- **JavaScript/TypeScript server** — the sync handler factories are npm packages. Rust, Python, Go backends are not supported.
- **Drizzle ORM on the server** — the sync repository (`createDrizzleSyncRepository`) is Drizzle-specific. Prisma, TypeORM, Kysely are not supported.

If any of these don't match, baresync is not the right tool.

## Setup

1. Search for `tauri-plugin-baresync` in any `Cargo.toml`.
   - **Found** → existing baresync project. Check which essential pieces exist and which are missing. Guide the user to fill gaps. Load the relevant command reference based on intent.
   - **Not found** → user may want to add baresync. Load `reference/setup.md`.

If the request is about a specific workflow, use the matching workflow below instead of guessing from command names.

## Workflows

### Workflow: Setup Baresync

**Input:** User wants to add Baresync, scaffold a project, or configure sync for the first time.

**Read first:** `reference/setup.md`

**Steps:**

1. Check whether the project already has `tauri-plugin-baresync` in any `Cargo.toml`.
2. If found, treat it as brownfield and identify missing essential pieces.
3. If not found, guide installation/scaffold steps from `reference/setup.md`.
4. Require Tauri 2.x, TypeScript server, and Drizzle ORM before continuing.
5. Explain only the next concrete files the user should create or modify.

**Output:** A checklist of missing pieces, exact files to create/modify, and the next generation command.

**Do not:** Restructure the user's project to match the scaffold if they already have a layout.

### Workflow: Write Synced Data

**Input:** User wants to create, update, or delete data that should sync.

**Read first:** `reference/write.md`

**Steps:**

1. Identify the synced table and operation.
2. Verify the write goes through `writeTransaction`.
3. Verify the write records a matching `writeLocalChange`.
4. For deletes, use soft delete by setting `deletedAt`; do not hard delete.
5. If code is missing context, inspect the app's existing write helpers before proposing changes.

**Output:** Code or guidance that preserves the outbox invariant.

**Do not:** Suggest direct Drizzle writes for synced data.

### Workflow: Generate Sync Contract

**Input:** User asks about `sync.config.ts`, generated files, schema snapshots, doctor, or generator errors.

**Read first:** `reference/generator.md`

**Steps:**

1. Verify `apiSyncedSchema` and `localSyncedSchema` are file path strings.
2. Verify each configured table exists in both loaded schema modules.
3. Verify `outputDir` is correct for the sync contract package.
4. Verify generated dated artifacts are consumed by server and Tauri plugin paths.
5. For unexplained behavior, inspect `packages/baresync/src/generator/`.

**Output:** Exact config correction, generated-file expectation, or diagnostic interpretation.

**Do not:** Mention `schemaSourceDir` except when explaining migration from old versions.

### Workflow: Debug Broken Sync

**Input:** User reports missing data, stuck outbox, failed push/pull, migration errors, generated import errors, or runtime sync errors.

**Read first:** `reference/debug.md`

**Steps:**

1. Classify the failure: startup, generation, migration, push, pull, outbox, UI invalidation, or auth/scope.
2. Ask for logs only if the failure cannot be classified from the prompt or workspace.
3. Check generated contract and schema paths before debugging runtime behavior.
4. Check outbox and cursor state before assuming server bugs.
5. Load `reference/verify.md` if the issue smells like incomplete integration.
6. Load `reference/source.md` for exact implementation behavior.

**Output:** Most likely cause, evidence, and the smallest next verification command or code change.

**Do not:** Skip directly to source spelunking before using the debug checklist.

### Workflow: Explain Baresync API

**Input:** User asks what a function, helper, type, generated file, or concept does.

**Read first:** `reference/query.md`

**Steps:**

1. Look for the concept in `reference/query.md`.
2. If the reference does not define the exact API/type, load `reference/source.md`.
3. Inspect the mapped workspace source file.
4. Explain the behavior in terms of inputs, outputs, side effects, and common misuse.
5. If the skill reference is stale, say so and cite the workspace source behavior.

**Output:** A grounded explanation with file references when source was inspected.

**Do not:** Read `node_modules` when `packages/baresync/src/` or `crates/` exists.

### Workflow: Deep Engine Internals

**Input:** User asks how the sync engine makes decisions, chunks payloads, retries 413s, stores runtime tables, advances cursors, orders tables, or transforms pull/push data.

**Read first:** `reference/internals.md`

**Steps:**

1. Read `reference/internals.md` before `reference/query.md` or `reference/source.md`.
2. Use the internals reference for status flow, chunking, idempotency, cursor storage, table ordering, and runtime table behavior.
3. If the question needs exact implementation details or the reference is stale, inspect the mapped workspace source.
4. Explain the mechanism in terms of decision points, inputs, outputs, and invariants.

**Output:** A grounded explanation of engine behavior, or source-backed clarification if the reference is stale.

**Do not:** Route these questions through `query.md` first when the user is clearly asking about engine mechanics.

### Workflow: Verify Existing Integration

**Input:** User asks whether their Baresync setup, generated artifacts, server handlers, Tauri plugin, or local writes are correct.

**Read first:** `reference/verify.md`

**Steps:**

1. Check essential pieces from `SKILL.md`.
2. Check schema, generator, server, client writes, Tauri plugin, UI, and tests separately.
3. Report findings by severity.
4. Include missing verification commands.
5. Do not rewrite code unless the user asks to fix findings.

**Output:** Findings first, then residual risks and suggested next commands.

**Do not:** Give a vague "looks good" without checking the required pieces.

## Essential pieces

These must exist for baresync to work. Project structure (file paths, directory names) does not matter — only these pieces do:

| Piece | What it is |
|-------|-----------|
| **`SYNC_SCOPE`** | One shared constant, imported by both client and server. Prevents scope mismatches. |
| **Synced schemas** | Two Drizzle schema files defining the same tables: `api-synced-schema` (server) and `local-synced-schema` (client). Same table names, same business columns, different sync metadata (`apiSyncColumns()` vs `localSyncColumns()`). |
| **Local infrastructure schema** | `local-schema.ts` — defines `syncOutbox` (pending changes) and `syncCursors` (last-synced timestamp per scope). Required on the client side. |
| **Server infrastructure schema** | `api-schema.ts` — defines `syncBatchRequests` (server-side sync batch tracking). Required on the server side. |
| **`sync.config.ts`** | Maps table names to scope columns. Used by the generator. |
| **Generated contract** | `bun run generate:sync` produces `generated/<YYYY-MM-DD>/sync-contract.json` and schema snapshots. |
| **Server repository** | 5 functions per table: `buildRow`, `readLatestRow`, `readRows`, `softDeleteRow`, `upsertRow`. |
| **Server routes** | Push/pull/status endpoints using `createSyncPushHandler` (requires `idempotency`), `createSyncPullHandler`, `createSyncStatusHandler`. |
| **Client db helper** | `createTauriDrizzleDatabase` with a TABLE registry of all synced + runtime tables. |
| **Client sync client** | `createSyncClient` scoped to `SYNC_SCOPE`. |
 | **Plugin config** | In `lib.rs`: `api_base_url`, `contract_json` (via `include_str!`), `db_path`, `migrations_path`, `poll_interval_secs`. |
 | **Runtime request headers** | Custom HTTP headers attached to every sync request. Set via `client.setHeaders()` (JS) or `set_headers` Tauri command. Plugin-wide, not per-scope. `Content-Type` is reserved. Empty `{}` clears all headers. |
| **Migrations** | Local: outbox + cursors + synced tables. Server: synced tables + batch requests. |

For brownfield projects: scan the project, identify which pieces exist, and guide the user to add what's missing. Do not restructure their project to match the scaffold layout.

## Concepts

These are always loaded. They apply to every command.

### Local-first

App reads and writes SQLite directly. No network needed. Sync happens later via polling.

### Outbox pattern

Every syncable write goes through `writeTransaction` + `writeLocalChange`. This atomically performs the mutation AND inserts an outbox entry. If network is down, the entry waits. Next poll cycle, it pushes.

**Never write directly with Drizzle for syncable data.** Direct writes bypass the outbox and will not be pushed.

### Paired schemas

Every synced table exists in two Drizzle schema files:

- **`local-synced-schema.ts`** — uses `localSyncColumns()` which adds `isSynced` (boolean), `deletedAt`, `createdAt`, `updatedAt`
- **`api-synced-schema.ts`** — uses `apiSyncColumns()` which adds `syncUpdatedAt` (integer cursor), `deletedAt`, `createdAt`, `updatedAt`

Same table name, same business columns, different sync metadata. The sync contract (generated JSON) is the shared truth.

### Sync contract

Generated by `bun run generate:sync` from `sync.config.ts`. Outputs to `generated/<YYYY-MM-DD>/`:

- `sync-contract.json` — loaded by Tauri plugin at compile time via `include_str!`
- `sync-table-order.ts` — `SYNC_UPSERT_ORDER` and `SYNC_DELETE_ORDER` arrays
- Frozen schema snapshots — server imports from these

### Server wins

When the same row changes on both client and server, the server state overwrites local during pull. No conflict resolution.

### Scope

Every synced row belongs to a scope (tenant/workspace). Your server's `resolveScope` function gates access per request. The contract defines which column is the scope column. The `SYNC_SCOPE` constant must be shared between client and server.

### Soft deletes

Baresync uses soft deletes by default. A deleted row gets a `deletedAt` timestamp and `isSynced: false`. The sync engine pushes this as an update so the server can mark the row as deleted.

### Runtime request headers

Custom HTTP headers sent with every sync request (push, pull, status). Use for authentication tokens, API keys, or tenant identifiers.

**API:** `client.setHeaders(headers: Record<string, string>)` on the JS sync client, or the `set_headers` Tauri plugin command from Rust.

**Rules:**
- `Content-Type` is reserved and rejected as a custom header.
- Headers are validated using HTTP header parsing types. Invalid updates do not replace existing headers (atomic).
- Passing `{}` clears all custom headers.
- All writers (JS, Rust, builder) share one header store. Headers are plugin-wide, not per-scope.
- Transport snapshots headers before each request. In-flight requests use the old snapshot.

**When JS owns credentials** (e.g. OAuth token in browser storage): call `setHeaders` from JS after login or token refresh.

**When Rust owns credentials** (e.g. keychain-stored API key): use `set_headers_with_state` from Rust host code, or `Builder::new().headers(...)` for static startup headers.

**Do not:** log header values (they contain secrets), recreate the sync client for token refresh, or put auth business logic inside the plugin.

### Sync flow

```
Local write → outbox entry → plugin polls → push to server → pull from server → apply to local DB → emit events → React Query invalidates
```

### Glossary

| Term | Definition |
|---|---|
| **Baseline sync** | The first sync for a scope — pulls all existing server data. Happens when no cursor is stored. |
| **Chunking** | Splitting large push payloads into smaller batches that fit within size and row limits. Automatic. |
| **Client ID** | Unique identifier generated per local database (`sync_client_identity`). Used for idempotency. |
| **Cursor** | Server watermark `sync:{timestamp}:{table}:{rowId}`. Tracks last synced position. Stored in `sync_cursors`. |
| **Delete order** | Reverse of upsert order — child tables deleted before parents. |
| **Drizzle proxy** | Drizzle ORM driver that serializes SQL to JSON, sends via Tauri IPC to Rust. Created by `createTauriDrizzleDatabase`. |
| **Full resync** | Dropping stored cursor and re-pulling all server data. Recovery after corruption. |
| **Garbage collection** | Removing soft-deleted rows where `is_synced = true` and `deleted_at` is set. Runs via `runGarbageCollection`. |
| **Idempotency key** | SHA-256 of sorted outbox IDs per push batch. Prevents duplicate processing on retries. |
| **Local-only columns** | Columns in local schema but not sent to server (e.g. `is_synced`). Stripped from push payloads. |
| **Outbox** | `sync_outbox` table — queues local writes for push. Each entry has `synced_at` (null until confirmed). |
| **Polling** | Automatic background sync on a timer. Configured via `poll_interval_secs` on the builder. |
| **Pull** | Fetching server changes and applying locally. Cursor-based incremental. |
| **Push** | Sending local outbox changes to server. Chunked, sent, marked synced on success. |
| **Server-only columns** | Columns on server but not in local schema (e.g. `sync_updated_at`). Not sent to client. |
| **Transport** | HTTP transport layer (`SyncHttpTransport` trait). Default uses reqwest. Customizable for testing. |
| **Upsert order** | Order tables are processed during inserts/updates — parents before children. Respects FKs. |
| **Watermark** | The `sync_updated_at` value on the server — timestamp component of the cursor. |
| **writeTransaction** | Transaction wrapping Drizzle writes with outbox entry creation. Ensures atomicity. |
| **Runtime request headers** | Custom HTTP headers sent with every sync request. Set via `setHeaders` (JS) or `set_headers` (Rust). Plugin-wide, atomic updates, transport snapshots per request. |

## Commands

If you are unsure which command applies, use `Prompt Processing (MANDATORY)` first.

| Command   | When to load | Reference |
|-----------|-------------|-----------|
| `setup`   | User asks how to start, scaffold, install, or configure baresync | [reference/setup.md](reference/setup.md) |
| `write`   | User asks how to create, update, or delete local data that syncs | [reference/write.md](reference/write.md) |
| `server`  | User asks about server routes, sync repository, scope resolution, or backend changes | [reference/server.md](reference/server.md) |
| `schema`  | User asks to add, remove, or modify synced tables or columns | [reference/schema.md](reference/schema.md) |
| `debug`   | User reports sync issues, data conflicts, missing data, or errors | [reference/debug.md](reference/debug.md) |
| `query`   | User asks a conceptual question about how baresync works | [reference/query.md](reference/query.md) |
| `ui`      | User asks how to wire sync into React, Solid, or any UI framework | [reference/ui-frameworks.md](reference/ui-frameworks.md) |
| `internals` | User asks about engine internals, chunking, idempotency, or status flow | [reference/internals.md](reference/internals.md) |
| `generator` | User asks about sync config, CLI flags, generated files, or contract generation | [reference/generator.md](reference/generator.md) |
| `tauri-plugin` | User asks about plugin builder, Tauri commands, polling, migrations, or plugin testing | [reference/tauri-plugin.md](reference/tauri-plugin.md) |
| `testing` | User asks how to test baresync integration, write tests, or verify sync behavior | [reference/testing.md](reference/testing.md) |
| `production` | User asks about production config, monitoring, performance, DB resets, or maintenance | [reference/production.md](reference/production.md) |
| `verify` | User asks to review, audit, or validate an integration | [reference/verify.md](reference/verify.md) |
| `prompt-fixtures` | Skill maintainers want to check routing behavior | [reference/prompt-fixtures.md](reference/prompt-fixtures.md) |
| `source`    | All other references exhausted, or you need to inspect actual implementation details | [reference/source.md](reference/source.md) |

## Routing rules

1. **First word matches a command**: load its reference and follow it.
2. **First word doesn't match, but intent maps**: load that intent's reference.
3. **User reports an error or bug**: load `reference/debug.md`.
4. **User asks "what is" or "how does"**: load `reference/query.md`.
5. **User asks about engine mechanics**: load `reference/internals.md`.
6. **No clear match**: answer from concepts section if general enough, otherwise load the closest command reference.
7. **All other references exhausted and still stuck**: load `reference/source.md`, which should prefer the workspace source of truth over installed-package copies.
8. **If the request is about skill behavior itself**: load `reference/prompt-fixtures.md` or `reference/source.md`.

## Absolute bans

- Never suggest direct Drizzle writes for syncable data (must use `writeTransaction` + `writeLocalChange`).
- Never skip the sync contract regeneration step after schema changes.
- Never use `delete` (hard delete) on synced tables — always soft delete via `deletedAt`.
- Never import from generated schema files in the Tauri app — app imports from source schemas.
- Never forget to update the `include_str!` path in `lib.rs` after regenerating the contract.
- Never put `Content-Type` in `setHeaders` — it is reserved.
- Never log header values — they contain secrets.
- Never recreate the sync client to refresh tokens — call `setHeaders` instead.
