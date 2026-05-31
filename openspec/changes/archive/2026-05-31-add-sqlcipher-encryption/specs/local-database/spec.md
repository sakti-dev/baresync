## ADDED Requirements

### Requirement: Encrypted local database open
The local database layer SHALL support opening a SQLCipher-encrypted database when encryption is configured.

#### Scenario: Encrypted database created
- **WHEN** `LocalDatabase::connect` or equivalent database setup is called with encryption configured and no database file exists
- **THEN** the local database SHALL be created as encrypted and normal migrations SHALL run after successful open

#### Scenario: Encrypted database reopened
- **WHEN** database setup is called with encryption configured and the correct existing key
- **THEN** the local database SHALL open successfully and existing data SHALL remain available

### Requirement: Plaintext local database compatibility
The local database layer SHALL preserve plaintext database behavior when encryption is not configured.

#### Scenario: Plaintext database remains default
- **WHEN** database setup is called without encryption configured
- **THEN** the local database SHALL open as normal plaintext SQLite

#### Scenario: Existing plaintext database remains readable without encryption
- **WHEN** a plaintext database exists and encryption is not configured
- **THEN** database setup SHALL open it successfully

### Requirement: Encrypted mode rejects plaintext database
The local database layer SHALL fail clearly when encrypted mode is enabled for an existing plaintext database.

#### Scenario: Plaintext database with encryption configured
- **WHEN** a plaintext SQLite file exists at the configured DB path and encryption is enabled
- **THEN** database setup SHALL fail before migrations with an error that tells the app to move, delete, or migrate the existing plaintext database separately
