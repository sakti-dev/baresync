## 1. Prerequisites And TDD Baseline

- [ ] 1.1 Confirm `introduce-db-worker-abstraction` and `replace-sqlx-with-rusqlite` have landed or rebase this change onto a codebase with a `rusqlite` worker-backed `DbClient`.
- [ ] 1.2 Read `openspec/knowledge/E2E-TESTING-RUNBOOK.md` before changing or verifying Tauri, Android, fixture app, or E2E smoke behavior.
- [ ] 1.3 Add failing tests proving no encryption provider opens plaintext SQLite as before.
- [ ] 1.4 Add failing tests proving an encryption provider creates a new encrypted DB and migrations run successfully.
- [ ] 1.5 Add failing tests proving the same key reopens an encrypted DB and preserves data/migration records.
- [ ] 1.6 Add failing tests proving the wrong key fails setup without exposing plugin state.
- [ ] 1.7 Add failing tests proving encryption enabled against an existing plaintext DB fails with an actionable error.
- [ ] 1.8 Add failing tests proving key material is not included in debug output, errors, logs, sync payloads, or command responses.

## 2. Feature And Dependency Wiring

- [ ] 2.1 Add an optional SQLCipher/encryption Cargo feature to the relevant Rust crates.
- [ ] 2.2 Configure `rusqlite` SQLCipher support behind the feature without requiring encryption for plaintext builds.
- [ ] 2.3 Ensure plaintext builds compile and run without SQLCipher key providers.
- [ ] 2.4 Ensure encryption APIs are only available or only functional when the SQLCipher feature is enabled, with clear errors otherwise.

## 3. Public Encryption API

- [ ] 3.1 Add `DatabaseKey` or equivalent raw 32-byte key type with redacted debug behavior.
- [ ] 3.2 Add `EncryptionKeyContext` containing non-sensitive setup context such as DB path.
- [ ] 3.3 Add synchronous `EncryptionKeyProvider` trait for app-owned key retrieval/creation.
- [ ] 3.4 Add `Builder::encryption_key_provider(...)` to the Tauri plugin builder.
- [ ] 3.5 Thread encryption configuration from builder/config into `DbClient` setup without exposing key material.

## 4. SQLCipher Database Setup

- [ ] 4.1 Apply SQLCipher key immediately after opening the worker-owned connection and before any schema access.
- [ ] 4.2 Run a lightweight validation query after applying the key to distinguish wrong-key/open failures.
- [ ] 4.3 Preserve normal migration, client identity, schema inspection, and command setup after encrypted open succeeds.
- [ ] 4.4 Fail setup before managed plugin state is exposed if key provider or encrypted DB open fails.
- [ ] 4.5 Fail clearly when encrypted mode is configured for an existing plaintext database.

## 5. Docs And Examples

- [ ] 5.1 Document that encryption is opt-in and no provider means plaintext SQLite.
- [ ] 5.2 Document that apps own device-local key creation/storage and the server does not need the DB key.
- [ ] 5.3 Document that JS provisioning/pairing happens after DB setup and cannot be the source of the initial DB key.
- [ ] 5.4 Document existing plaintext DB behavior when enabling encryption: move, delete, or migrate separately.
- [ ] 5.5 Add a minimal example key provider using pseudo-code or test-only storage without prescribing a production keychain crate.

## 6. Verification

- [ ] 6.1 Run `cargo test -p baresync-core` without SQLCipher feature.
- [ ] 6.2 Run `cargo test -p baresync-core --features sqlcipher` or the selected feature name.
- [ ] 6.3 Run `cargo test -p tauri-plugin-baresync --test commands` without SQLCipher feature.
- [ ] 6.4 Run `cargo test -p tauri-plugin-baresync --features sqlcipher --test commands` or the selected feature name.
- [ ] 6.5 Run desktop Tauri compile/build verification with SQLCipher enabled.
- [ ] 6.6 Run Android compile/APK verification with SQLCipher enabled.
- [ ] 6.7 Run `cargo test --workspace` for the default plaintext build.
- [ ] 6.8 Run `bun x ultracite check`.
- [ ] 6.9 Run `bun run typecheck`.
- [ ] 6.10 Run `openspec status --change add-sqlcipher-encryption` and confirm artifacts/tasks remain valid.
