## MODIFIED Requirements

### Requirement: Plain SQLite default
The `rusqlite` backend SHALL open normal plaintext SQLite databases by default. When SQLCipher encryption is configured, the backend SHALL apply the encryption key before accessing database schema or running migrations.

#### Scenario: No encryption support in backend swap
- **WHEN** no encryption key provider is configured
- **THEN** Baresync SHALL NOT require encryption keys, SQLCipher runtime configuration, or key providers to open the local database

#### Scenario: Existing plaintext database opens
- **WHEN** a Baresync plaintext SQLite database exists and no encryption key provider is configured
- **THEN** the `rusqlite` backend SHALL open it and preserve existing data and migration records

#### Scenario: Encryption key applied before schema access
- **WHEN** an encryption key provider is configured
- **THEN** the `rusqlite` worker backend SHALL apply the SQLCipher key before migrations, schema reads, client identity setup, or command state exposure
