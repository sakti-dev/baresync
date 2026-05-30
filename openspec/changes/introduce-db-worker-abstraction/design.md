## Context

Baresync currently uses SQLx directly across the core and Tauri plugin crates. `SqlitePool` is stored in plugin state, passed into the sync engine, passed into migration helpers, and exposed in Rust-facing APIs. The pool is configured with a single connection today, which already approximates serialized access, but the SQLx type is still embedded throughout the architecture.

The next storage direction is to support a synchronous SQLite backend, likely `rusqlite`, so Baresync can later use SQLCipher in a buildable cross-platform way. Moving directly from SQLx to `rusqlite` would mix backend replacement with a broad API refactor. This change introduces the database client/worker boundary first while preserving current behavior.

## Goals / Non-Goals

**Goals:**

- Replace direct `SqlitePool`/`SqliteConnection` usage in Baresync public Rust contracts with a backend-neutral `DbClient` abstraction.
- Preserve existing JS/TypeScript API behavior, Tauri command names, Drizzle proxy behavior, migration semantics, polling notifications, and plaintext SQLite behavior.
- Define serial database execution semantics and non-interleaved batch transaction behavior as explicit requirements.
- Keep the first implementation test-driven and behavior-preserving.
- Make a later `rusqlite` implementation possible without redesigning the sync engine and plugin command surfaces again.

**Non-Goals:**

- Do not replace SQLx with `rusqlite` in this change.
- Do not add SQLCipher, encrypted database support, key providers, or encryption-related public APIs in this change.
- Do not add auth token providers or change sync HTTP transport behavior.
- Do not change migration file format, Drizzle schema requirements, or server route contracts.
- Do not expose backend-specific connection types through the new abstraction.

## Decisions

### Use `DbClient` as the public Rust database handle

`DbClient` becomes the handle that core and plugin code pass around instead of `SqlitePool`. It exposes async methods for the operations Baresync needs: query, execute, batch transaction, migration helpers, schema inspection, sync helper queries, and DB metadata access.

Alternative considered: introduce a generic trait over database backends. That would spread generics through the sync engine and plugin state and make the first refactor larger. A concrete `DbClient` keeps call sites simple and still allows the implementation behind it to change.

### Preserve SQLx behind `DbClient` for the first change

The first implementation can wrap the existing SQLx single-connection pool while call sites migrate to `DbClient`. This keeps behavioral risk low and avoids debugging a backend rewrite at the same time as the API refactor.

Alternative considered: introduce the abstraction and immediately implement it with `rusqlite`. That is the end goal, but it increases the blast radius and makes test failures harder to classify.

### Specify worker semantics now, implementable with SQLx first

The abstraction SHALL guarantee serial database request execution and non-interleaving batch transactions. With SQLx, this can be implemented using the current max-one-connection pool plus abstraction-level tests. A later `rusqlite` change can implement the same contract with a dedicated blocking worker thread and message queue.

Alternative considered: leave serialization as an implementation detail. That would make the later sync-to-async boundary ambiguous and would not protect transaction correctness when Drizzle proxy batches and background sync run concurrently.

### Keep transactions request-scoped

Baresync SHALL treat `run_sql_batch` and internal migration/sync transactions as complete transaction requests. It SHALL NOT support independent `BEGIN` and `COMMIT` calls that span await points and can interleave unrelated queued work.

Alternative considered: emulate arbitrary transaction sessions through the worker. That requires transaction handles, session affinity, cancellation rules, and timeout policy. Baresync does not need that complexity for current Drizzle proxy and sync behavior.

### Accept Rust API breakage

Existing Rust APIs and docs mention `SqlitePool`. These SHALL move to `DbClient`/`LocalDatabase` APIs. This is acceptable because the package is not yet externally adopted and the change reduces future breaking changes.

Alternative considered: keep pool-returning compatibility functions. That would preserve the coupling this change is meant to remove.

## Risks / Trade-offs

- Rust API churn → Mitigation: update docs, examples, and tests in the same change; keep JS/Tauri command behavior stable.
- Abstraction becomes too generic → Mitigation: expose only operations Baresync already needs; avoid backend traits/generics until a second backend exists.
- Transaction behavior differs subtly from SQLx → Mitigation: add failing tests first for batch rollback and concurrent batch non-interleaving.
- Existing specs conflict with both `local-database` and `local-db-runtime` pool wording → Mitigation: include delta specs for every current capability that names `SqlitePool` behavior.
- Later `rusqlite` worker may reveal missing operations → Mitigation: keep `DbClient` methods domain-neutral but add explicit primitives for query, execute, batch, and transactional closures/requests.

## Migration Plan

1. Add failing tests around desired `DbClient` behavior and existing command behavior.
2. Introduce `DbClient` and `LocalDatabase` APIs backed by the existing SQLx pool.
3. Move core database modules from pool parameters to `DbClient` parameters.
4. Move plugin state from `Arc<SqlitePool>` to `DbClient`.
5. Update docs and OpenSpec references from pool-based APIs to database-client APIs.
6. Run the existing Rust, TypeScript, Ultracite, and typecheck verification.

Rollback is straightforward before archive: revert the change and keep SQLx pool APIs. Runtime migration is not required because the SQLite database file format and migration records do not change.

## Open Questions

- None for this change. SQLCipher feature flags, encryption key provider shape, existing plaintext DB encryption failures, and Android SQLCipher verification belong to later changes.
