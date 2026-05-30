## Context

`introduce-db-worker-abstraction` establishes `DbClient` as the async facade for local SQLite work and removes direct SQLx pool exposure from normal Baresync APIs. This change preserves that facade while replacing the underlying backend from SQLx to `rusqlite`.

The reason to move to `rusqlite` is practical: Baresync’s client database is local SQLite, operations are already serialized for transaction safety, and `rusqlite` is synchronous. A dedicated worker thread maps cleanly to this model and prepares the project for a later SQLCipher change where `rusqlite` has a simpler bundled SQLCipher path than SQLx/native SQLCipher linkage, especially for Android.

## Goals / Non-Goals

**Goals:**

- Replace SQLx with `rusqlite` for Baresync local client database access.
- Keep `DbClient` async for Tauri commands, polling, and sync engine callers.
- Run all blocking SQLite work on a dedicated worker thread instead of the async runtime.
- Preserve serialized database execution and non-interleaved transaction/batch behavior.
- Preserve plaintext SQLite defaults, migration behavior, Drizzle proxy behavior, plugin events, and JS/TypeScript APIs.
- Remove SQLx dependencies from `baresync-core` and `tauri-plugin-baresync` where no longer needed.

**Non-Goals:**

- Do not add SQLCipher or encrypted DB support in this change.
- Do not add `encryption_key_provider`, keychain helpers, or DB conversion helpers.
- Do not change server sync APIs, transport/auth behavior, or JavaScript client APIs.
- Do not expose `rusqlite::Connection` publicly through Baresync APIs.
- Do not support long-lived transaction sessions across await points.

## Decisions

### Use a dedicated OS thread per `DbClient`

Each `DbClient` SHALL own a request sender connected to one worker thread. The worker thread owns one `rusqlite::Connection` and executes requests synchronously in receive order.

Alternative considered: wrap every `rusqlite` call in `tokio::task::spawn_blocking`. That would scatter the sync-to-async boundary across the codebase, make transaction ownership harder to reason about, and increase the risk of accidental cross-await transaction bugs.

### Use request/reply message passing

Async callers SHALL submit database work through a bounded channel. Each request carries a reply channel used to return `Result<T, SyncError>`. The worker handles one request at a time, sends the result, then moves to the next request.

Alternative considered: protect a shared `rusqlite::Connection` with `Mutex` and call it from async tasks. That risks blocking async executor threads and does not create a clear central place for cancellation, shutdown, and transaction semantics.

### Execute full transactions inside the worker

Batch operations, migrations, push/pull apply phases, and any internal transactional work SHALL execute as one worker request. The worker opens the transaction, runs all statements/logic, commits or rolls back, and only then handles the next request.

Alternative considered: allow callers to send `BEGIN`, individual statements, and `COMMIT` as independent queued requests. That can interleave unrelated work inside a transaction and corrupt atomicity.

### Keep `DbClient` backend-neutral

The public Rust surface SHALL stay on Baresync-owned types. SQL values, rows, execution metadata, and errors are converted at the boundary. No public API should require `rusqlite` imports for normal use.

Alternative considered: expose `rusqlite::Connection` access for escape hatches. That would re-couple users to the backend and bypass the worker serialization guarantees.

### Start with plaintext `rusqlite`

This change SHALL use normal SQLite through `rusqlite`. SQLCipher support, bundled SQLCipher feature flags, key providers, and existing plaintext database failure policy are intentionally deferred to a later change.

Alternative considered: combine `rusqlite` and SQLCipher in one change. That increases risk and makes build failures harder to classify. The backend swap should be validated independently first.

## Risks / Trade-offs

- Reduced read concurrency compared with a pool → Mitigation: Baresync is a local-first client DB with correctness-sensitive writes; serialized local access is an explicit design goal.
- Blocking worker can become a bottleneck for large sync batches → Mitigation: keep batch operations transactional and measure after parity; optimize chunk sizes before adding multiple connections.
- Request cancellation cannot interrupt an in-flight SQLite call → Mitigation: document that dropped reply receivers do not cancel already-running operations; worker continues to completion.
- SQL value conversion differences between SQLx and `rusqlite` → Mitigation: add parity tests for nulls, integers, floats, booleans, strings, JSON-compatible output, rows affected, and last insert rowid.
- Build differences across desktop and Android → Mitigation: add explicit desktop and Android compile verification tasks before considering this backend swap complete.

## Migration Plan

1. Complete and apply/archive `introduce-db-worker-abstraction`.
2. Add failing parity tests for the `DbClient` behavior currently backed by SQLx.
3. Add `rusqlite` dependency and implement a worker-backed `DbClient`.
4. Move binding, row conversion, transaction, migration, and schema inspection logic to `rusqlite`.
5. Remove SQLx dependencies and imports from core/plugin crates.
6. Run Rust, TypeScript, Ultracite, desktop build, and Android compile verification.

Rollback before release is to restore the SQLx-backed `DbClient`. Runtime database migration is not required because this change keeps normal plaintext SQLite files and the same schema/migration records.

## Open Questions

- Exact `rusqlite` feature flags should be confirmed during implementation. The first version should avoid SQLCipher flags and only enable what plaintext SQLite needs.
- Android verification command details may depend on the current Tauri Android build setup and should use the repository E2E/mobile runbook before implementation verification.
