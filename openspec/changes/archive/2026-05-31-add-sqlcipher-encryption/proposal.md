## Why

Baresync needs optional encryption at rest for local client databases, especially for POS/tablet deployments where device loss is a realistic risk. After the DB worker and `rusqlite` backend changes, SQLCipher can be added as an opt-in storage mode without changing JS/Tauri command behavior or involving the sync server in local database key management.

## What Changes

- Add optional SQLCipher support for local SQLite databases behind the existing `DbClient`/`rusqlite` worker backend.
- Add a public `encryption_key_provider(...)` builder API for apps that choose encrypted local storage.
- Define an app-owned key-provider contract: the app creates, retrieves, and stores a device-local 256-bit key before Baresync opens the database.
- Keep plaintext SQLite as the default when no encryption key provider is configured.
- Fail clearly when encryption is enabled for an existing plaintext database instead of attempting automatic conversion.
- Keep authentication, provisioning, pairing, server-side key escrow, keychain implementation, and plaintext-to-encrypted migration helpers out of scope.
- Add build verification requirements for desktop and Android because SQLCipher/native SQLite build behavior is the main implementation risk.

## Capabilities

### New Capabilities

- `sqlcipher-encryption`: Defines opt-in encrypted local database behavior, key-provider API, SQLCipher setup, failure modes, and build verification expectations.

### Modified Capabilities

- `rusqlite-db-backend`: Add optional SQLCipher connection setup while preserving plaintext default behavior.
- `tauri-plugin-builder`: Add encryption key provider configuration and require encrypted DB setup before plugin state is exposed to JS.
- `local-database`: Define encrypted local database open/reopen behavior, plaintext fallback, and existing plaintext failure behavior.
- `local-db-runtime`: Document runtime expectations for encrypted startup, diagnostics, and DB info behavior.
- `cargo-workspace`: Add feature/dependency expectations for optional SQLCipher support.

## Impact

- Prerequisites: `introduce-db-worker-abstraction` and `replace-sqlx-with-rusqlite` should land first.
- Affected Rust modules include builder/config, database connection setup, `DbClient` worker initialization, error types, docs, and plugin host tests.
- Apps that do not configure encryption should see no behavior change.
- Apps that configure encryption must provide a Rust-side key provider available during plugin setup, before JS/webview code runs.
- The server does not receive, store, derive, or recover local database encryption keys.
