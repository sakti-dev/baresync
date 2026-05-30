## Why

After Baresync has a backend-neutral `DbClient`, the next step is to remove SQLx from the local client database layer and run SQLite through `rusqlite` behind the same async facade. This preserves the knowledge that the `rusqlite` move is primarily a backend implementation swap that prepares Baresync for later SQLCipher support without changing the JS/Tauri user experience.

## What Changes

- Replace the SQLx-backed `DbClient` implementation with a `rusqlite`-backed implementation.
- Run synchronous `rusqlite` work on a dedicated database worker thread owned by `DbClient`.
- Use request/reply message passing so async Tauri commands and sync engine code can await database results without blocking the async runtime.
- Preserve `DbClient` semantics from `introduce-db-worker-abstraction`: serialized execution, non-interleaved batch transactions, dynamic rows, write metadata, startup migrations, and plaintext SQLite by default.
- Remove SQLx dependencies and SQLx-specific code paths from Baresync core/plugin crates.
- Add `rusqlite` as the SQLite backend dependency.
- Keep SQLCipher/encryption/key-provider APIs out of scope for this change; those belong to a later encryption change.
- **BREAKING** Remove any remaining public Rust API access to SQLx types. This should already be minimized by `introduce-db-worker-abstraction`.

## Capabilities

### New Capabilities

- `rusqlite-db-backend`: Defines the synchronous `rusqlite` backend, dedicated worker thread, message passing boundary, transaction behavior, and dependency expectations.

### Modified Capabilities

- `cargo-workspace`: Replace SQLx dependency expectations with `rusqlite` for the local client database crates.
- `local-database`: Preserve local database behavior while changing the backend from SQLx to `rusqlite` through `DbClient`.
- `local-db-runtime`: Preserve Drizzle proxy/runtime behavior while executing through the `rusqlite` worker backend.
- `migration-runner`: Preserve migration behavior while executing migrations through the `rusqlite` worker backend.
- `tauri-plugin-builder`: Preserve plugin setup and command behavior while using the `rusqlite` worker-backed `DbClient`.

## Impact

- Prerequisite: `introduce-db-worker-abstraction` should be implemented or applied first so this change can focus on the backend swap.
- Affected Rust dependencies include removing SQLx and adding `rusqlite`.
- Affected Rust modules include the database client implementation, SQL value binding/conversion, transaction execution, migration execution, schema inspection, and tests that directly used SQLx test helpers.
- JS/TypeScript APIs, Tauri command names, migration files, sync transport, server contracts, and default plaintext SQLite behavior should remain unchanged.
- Tests must follow TDD: first capture behavior parity and worker semantics, then replace the backend.
