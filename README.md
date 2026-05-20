# Baresync

SQLite-first sync infrastructure for Tauri apps.

Baresync is an opinionated sync stack for applications that keep working data in local SQLite and reconcile it with an app-owned backend. It combines Drizzle schema helpers, a generated sync contract, a Rust sync engine, a Tauri plugin, and server helpers for push, pull, and status routes.

The project is currently pre-release and private-package oriented inside this repository. The public package name is intended to be `baresync`; workspace examples currently use `@repo/baresync`.

## Why Baresync Exists

Local-first Tauri apps tend to grow the same sync plumbing repeatedly:

- SQLite setup and migrations.
- Drizzle access through Tauri IPC.
- Dirty-row tracking and outbox handling.
- Push chunking and idempotency.
- Pull cursors and soft deletes.
- Parent/child table ordering.
- Server route envelopes, limits, and encoding.
- Desktop and Android fixture verification.

Baresync turns that plumbing into a reusable contract and runtime while leaving product-specific authorization, tenancy, and persistence rules in your app.

## What It Provides

- Drizzle SQLite helpers for declaring synced tables and row-state columns.
- Contract diagnostics for primary keys, row state, scope columns, foreign keys, table order, and encoding support.
- Generated artifacts including `sync-contract.json`, `sync-table-order.ts`, manifests, and optional protobuf workspace files.
- A Rust core engine for status, push, pull, full sync, full resync, outbox cleanup, and garbage collection.
- A Tauri plugin that owns SQLite, migrations, Drizzle proxy commands, and sync commands.
- Server utilities for JSON/protobuf decoding, response encoding, payload limits, idempotency, cursor helpers, and handler factories.
- Fixture app and smoke automation for desktop and Android verification.

## Current Scope

Baresync is intentionally narrow for v1:

- Tauri apps.
- SQLite/libSQL local data.
- Drizzle SQLite schemas.
- Consumer-owned backend routes.
- Generated sync contracts.
- JSON as the baseline transport, with protobuf support where generated adapters are wired.

It is not a hosted sync service, generic ORM, generic SQLite plugin, or database-agnostic replication engine.

## How It Works

```mermaid
flowchart TD
  schema["Drizzle SQLite schema"]
  contract["syncSchema contract"]
  generator["Generator diagnostics and artifacts"]
  app["Tauri app<br/>Drizzle proxy + sync client"]
  plugin["tauri-plugin-baresync"]
  core["baresync-core"]
  sqlite[("SQLite + outbox")]
  backend["App backend<br/>status / pull / push"]

  schema --> contract --> generator
  generator --> app
  generator --> plugin
  generator --> backend
  app --> plugin --> core --> sqlite
  core <--> backend
```

The app defines synced Drizzle tables, generates a contract, registers the Tauri plugin with contract metadata, queries SQLite through the plugin, and calls sync commands for a concrete `scopeId`.

The backend remains app-owned. Baresync helps with request/response structure, idempotency, ordering, limits, and encoding, but your server still decides how scopes are authorized and how rows are persisted.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `packages/baresync` | TypeScript package: schema helpers, generator, DB proxy, server helpers, Tauri client |
| `crates/baresync-core` | Rust sync engine and SQLite runtime |
| `crates/tauri-plugin-baresync` | Tauri plugin wrapper and command surface |
| `tests/fixture-app` | Public fixture Tauri app used for desktop and Android smoke flows |
| `tests/e2e` | Fixture backend, generated protobuf workspace, desktop and Android automation |
| `apps/web` | Waku + Fumadocs documentation site |
| `docs` | Planning notes, runbooks, and implementation knowledge |
| `openspec` | Archived and active spec-driven change artifacts |

## Quick Start

The public install path is not published yet. In this repository, use the workspace package.

Define local synced tables:

```ts
import {
  localSyncRowState,
  syncedTable,
  syncSchema,
} from "@repo/baresync/schema";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  ...localSyncRowState,
});

export const syncedCategories = syncedTable(categories, {
  scope: "merchant_id",
  localOnlyColumns: ["isSynced"],
});

export const syncContract = syncSchema({
  packageName: "example.sync.v1",
  tables: [syncedCategories],
});
```

Run diagnostics and generation:

```bash
bun packages/baresync/src/cli.ts doctor ./sync.config.ts
bun packages/baresync/src/cli.ts generate ./sync.config.ts --output ./generated
```

Use the Tauri client from app code:

```ts
import { createSyncClient } from "@repo/baresync/tauri";
import { invoke } from "@tauri-apps/api/core";

const sync = createSyncClient({
  apiUrl: "https://api.example.com",
  encoding: "json",
  scopeId: "merchant-1",
  invoke,
});

await sync.syncNow();
```

Read the documentation site in `apps/web` for the fuller integration path.

## Development

Install dependencies:

```bash
bun install
```

Run the docs site:

```bash
cd apps/web
bun run dev
```

Run the standard checks:

```bash
bun x ultracite check
bun run typecheck
cd apps/web && bun run types:check && bun run build
```

Additional verification lives in the fixture and E2E workspaces. Before changing desktop, Android, Tauri, fixture app, fixture backend, or smoke automation, read `docs/knowledge/E2E-TESTING-RUNBOOK.md`.

## Design Principles

- Keep SQLite local interaction fast and explicit.
- Keep sync contracts generated and reviewable.
- Keep server authorization and tenancy app-owned.
- Prefer deterministic host tests before desktop or Android smoke tests.
- Treat JSON and protobuf as encodings of the same contract.
- Do not hide durable generation behind build magic.

## Status

Baresync is in active extraction and hardening. The core runtime, plugin wrapper, fixture app, protobuf generation path, and documentation site exist in this repo, but publishing metadata, release automation, and public API stability are still pending.

Do not treat the current workspace package names as final release guarantees.
