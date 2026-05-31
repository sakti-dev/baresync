## Context

The planned path is three staged changes: first introduce `DbClient`, then replace SQLx with a `rusqlite` worker backend, then add SQLCipher encryption. This change is the third step. It assumes the local database is opened by a `rusqlite` worker before migrations run and before Tauri managed command state is exposed to JS.

Encryption must be available during Rust plugin setup. JS-side provisioning or pairing happens too late because the local database and migrations must already be initialized before the webview code runs. Therefore Baresync needs a Rust-side key-provider hook, but the app must own key creation and secure storage policy.

## Goals / Non-Goals

**Goals:**

- Add optional SQLCipher encryption at rest for the local SQLite database.
- Keep plaintext SQLite as the default when no encryption provider is configured.
- Add a Rust builder API for an app-owned encryption key provider.
- Request the key during plugin/database setup before migrations and before JS starts.
- Support device-local key generation/storage patterns without Baresync choosing a keychain backend.
- Fail clearly when encryption is enabled against an existing plaintext DB.
- Verify desktop and Android builds with SQLCipher enabled.

**Non-Goals:**

- Do not add auth token providers, pairing, provisioning, or server-managed key escrow.
- Do not store, transmit, log, or sync database encryption keys.
- Do not provide automatic plaintext-to-encrypted DB conversion in this change.
- Do not add JS APIs for setting the DB key after startup.
- Do not make encryption mandatory for all apps.

## Decisions

### Use an app-owned synchronous key provider

Baresync SHALL expose a Rust-side `EncryptionKeyProvider` trait used during database setup. The provider SHALL be responsible for reading or creating the key from app-chosen secure storage.

The provider should be synchronous for the first version because plugin setup already needs the key before the database opens. Most expected sources are local secure storage or app-managed files. If async secure storage becomes necessary, a later change can add an async variant.

Alternative considered: generate and persist keys inside Baresync. That would make Baresync responsible for platform keychain policy, recovery behavior, dependency weight, and security posture.

### Use raw 32-byte database keys first

The initial public key type SHALL be a raw 32-byte key. Apps that want passphrases or derivation can perform their own KDF and return raw key material.

Alternative considered: accept passphrase strings. That invites weak user-chosen secrets and forces Baresync to define KDF policy, iteration counts, and migration behavior.

### Make encryption opt-in and feature-gated

Plaintext SQLite SHALL remain default. SQLCipher support SHOULD be behind a Cargo feature such as `sqlcipher` so apps that do not need encryption avoid extra native build complexity.

Alternative considered: always compile SQLCipher support. That increases build time, native dependency surface, and cross-platform risk for apps that do not need encrypted storage.

### Configure SQLCipher before migrations

When encryption is enabled, the worker SHALL apply the key immediately after opening the connection and before any schema reads, migrations, client identity setup, or command state exposure.

Alternative considered: allow JS to provide the key later. That conflicts with the startup requirement and would require a locked/uninitialized plugin state that current Baresync commands are not designed around.

### Fail on existing plaintext databases

If encryption is enabled and the existing DB file cannot be opened as SQLCipher with the supplied key, setup SHALL fail with an actionable error. Automatic conversion/export is out of scope.

Alternative considered: detect plaintext and automatically export to encrypted DB. That introduces data-loss and backup risks and should be a separate, deliberate migration feature.

## Risks / Trade-offs

- Key provider blocks startup → Mitigation: document that providers must do local, bounded work and return clear errors.
- Lost local key makes local DB unrecoverable → Mitigation: document this as expected security behavior; re-provision and re-sync from server rather than server-side key escrow.
- Existing plaintext users enabling encryption hit startup failure → Mitigation: fail clearly and document move/delete/manual migration options.
- SQLCipher Android build fails → Mitigation: require Android compile/APK verification before completion and prefer `rusqlite` bundled SQLCipher support where available.
- Logging leaks sensitive data → Mitigation: key material types must avoid `Debug` output of raw key bytes and errors must not include key contents.

## Migration Plan

1. Land `introduce-db-worker-abstraction`.
2. Land `replace-sqlx-with-rusqlite`.
3. Add SQLCipher feature/dependency wiring.
4. Add key-provider API and database open configuration.
5. Add tests for plaintext default, encrypted create/reopen, wrong key failure, existing plaintext failure, and no key leakage.
6. Update docs with app-owned key storage examples and warnings.
7. Verify desktop and Android builds with SQLCipher enabled.

Rollback before release is to disable/remove the SQLCipher feature and key-provider API. Runtime rollback from encrypted DB to plaintext is not supported by this change.

## Open Questions

- Exact `rusqlite` SQLCipher feature flags and dependency names must be confirmed during implementation against the selected `rusqlite` version.
- Whether to provide optional example key providers for desktop/mobile keychains should be decided separately; core Baresync should not depend on a specific secure-storage crate in this change.
