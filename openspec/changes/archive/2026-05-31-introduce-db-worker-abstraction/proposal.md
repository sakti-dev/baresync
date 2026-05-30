## Why

Baresync currently passes SQLx `SqlitePool` references through core and plugin APIs, which couples database behavior to SQLx and makes a future `rusqlite`/SQLCipher backend a broad rewrite. Introduce a dedicated database worker abstraction first so storage backend changes can happen behind a stable async facade while preserving current SQLite behavior.

## What Changes

- Add a database worker/client abstraction that owns the local SQLite execution boundary and exposes async query, execute, batch, transaction, migration, and inspection operations.
- Route Drizzle proxy SQL execution, migration runner operations, sync engine helpers, and plugin commands through the new database client instead of direct `SqlitePool` access.
- Specify serial execution guarantees for database work, including non-interleaved batch transactions.
- Preserve current plaintext SQLite behavior, migration semantics, command names, event behavior, polling notifications, and JS/TypeScript API behavior.
- **BREAKING** Replace public Rust APIs that expose or accept SQLx `SqlitePool`/`SqliteConnection` with database-client based APIs. This is acceptable because the Rust API is not yet consumed externally.
- Do not add `rusqlite`, SQLCipher, encryption, or key-provider APIs in this change. Those will be separate changes after the abstraction exists.

## Capabilities

### New Capabilities

- `db-worker-abstraction`: Defines the async database client and worker semantics used to serialize local SQLite operations behind a backend-neutral facade.

### Modified Capabilities

- `local-database`: Replace pool-based local database contracts with database-client contracts while preserving query, batch, DB info, and client identity behavior.
- `local-db-runtime`: Align runtime initialization and Drizzle proxy contracts with the database-client abstraction instead of direct SQLx pool access.
- `migration-runner`: Run migrations and migration status queries through the database client while preserving ordering, idempotency, and transaction semantics.
- `tauri-plugin-builder`: Store the database client in plugin state and route commands/setup through it while preserving startup and command behavior.

## Impact

- Affected Rust modules include `crates/baresync-core/src/db.rs`, `drizzle_proxy.rs`, `migrations.rs`, sync engine helpers, outbox/cursor/schema/push/pull/cleanup modules, and `crates/tauri-plugin-baresync` state/commands/builder tests.
- Public Rust API references to `SqlitePool` and `SqliteConnection` will change to the new database client abstraction.
- JS/TypeScript package APIs, Tauri command names, migration file formats, sync route contracts, and docs-facing user behavior should remain unchanged.
- Test coverage must follow TDD: add failing tests for database worker serialization, batch rollback, startup migration ordering, and existing plaintext behavior before implementing the abstraction.
