## ADDED Requirements

### Requirement: Optional encryption key provider
Baresync SHALL expose a Rust-side encryption key provider API for apps that opt into SQLCipher local database encryption. Apps SHALL own key creation, retrieval, storage, rotation policy, and recovery policy.

#### Scenario: App provides key during setup
- **WHEN** an app configures an encryption key provider on the Baresync builder
- **THEN** Baresync SHALL call the provider during Rust plugin/database setup before opening the usable local database

#### Scenario: Provider creates missing key
- **WHEN** the provider does not find an existing device-local key
- **THEN** the provider MAY generate and store a new key using app-owned secure storage and return it to Baresync

#### Scenario: Server does not receive key
- **WHEN** Baresync syncs or initializes the database
- **THEN** the local database encryption key SHALL NOT be sent to, required by, or stored on the sync server

### Requirement: Raw database key material
The initial encryption key API SHALL accept raw 32-byte key material for SQLCipher database encryption. Baresync SHALL NOT require or define a user passphrase flow.

#### Scenario: Raw key accepted
- **WHEN** the provider returns a valid 32-byte key
- **THEN** Baresync SHALL use that key to configure SQLCipher before accessing database schema

#### Scenario: Invalid key rejected
- **WHEN** the provider returns key material with an invalid length
- **THEN** Baresync SHALL fail setup with an error that does not include key contents

### Requirement: Plaintext default
Database encryption SHALL be opt-in. If no encryption key provider is configured, Baresync SHALL open normal plaintext SQLite databases as before.

#### Scenario: No provider opens plaintext
- **WHEN** an app builds Baresync without an encryption key provider
- **THEN** Baresync SHALL open or create a plaintext SQLite database

#### Scenario: Plaintext apps do not need SQLCipher runtime configuration
- **WHEN** an app does not enable encryption
- **THEN** the app SHALL NOT need to provide keys, key providers, provisioning state, or server-side encryption configuration

#### Scenario: Provider configured without SQLCipher feature
- **WHEN** an app configures an encryption key provider but builds without the SQLCipher feature
- **THEN** Baresync SHALL fail setup with a clear error that encryption requires the SQLCipher feature and SHALL NOT expose managed plugin state

### Requirement: Encrypted database lifecycle
When encryption is enabled, Baresync SHALL configure SQLCipher before migrations, client identity setup, schema inspection, or command state exposure.

#### Scenario: New encrypted database created
- **WHEN** encryption is enabled and the database file does not exist
- **THEN** Baresync SHALL create an encrypted SQLCipher database, run migrations, and expose plugin state only after setup succeeds

#### Scenario: Existing encrypted database reopens
- **WHEN** encryption is enabled and the provider returns the same key used previously
- **THEN** Baresync SHALL reopen the encrypted database and preserve existing data and migration records

#### Scenario: Wrong key fails
- **WHEN** encryption is enabled and the provider returns the wrong key for an existing encrypted database
- **THEN** Baresync SHALL fail setup with an actionable error and SHALL NOT expose managed plugin state

### Requirement: Existing plaintext database failure
Baresync SHALL NOT automatically convert existing plaintext databases to encrypted databases in this change.

#### Scenario: Encryption enabled for existing plaintext DB
- **WHEN** encryption is enabled and the database path points to an existing plaintext SQLite database
- **THEN** Baresync SHALL fail setup with a clear error explaining that the existing database cannot be opened as encrypted and must be moved, deleted, or migrated separately

### Requirement: Key secrecy
Baresync SHALL avoid exposing encryption key material through logs, debug output, errors, sync payloads, or command responses.

#### Scenario: Error omits key
- **WHEN** database encryption setup fails
- **THEN** returned errors and logs SHALL NOT include raw key bytes or derived key material

#### Scenario: Key type redacts debug output
- **WHEN** key-containing types are formatted for debug output
- **THEN** raw key contents SHALL be redacted or unavailable

### Requirement: SQLCipher build verification
The SQLCipher encryption feature SHALL be verified on supported desktop targets and Android before completion.

#### Scenario: Desktop build with SQLCipher
- **WHEN** the SQLCipher feature is enabled
- **THEN** the desktop Rust/Tauri build SHALL compile successfully

#### Scenario: Android build with SQLCipher
- **WHEN** the SQLCipher feature is enabled
- **THEN** the Android Tauri build or APK compile verification SHALL complete successfully or the implementation SHALL document the blocking native build issue
