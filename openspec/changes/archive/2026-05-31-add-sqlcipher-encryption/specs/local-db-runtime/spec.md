## ADDED Requirements

### Requirement: Encryption runtime diagnostics
The local DB runtime documentation and errors SHALL provide actionable diagnostics for encryption setup failures without exposing key material.

#### Scenario: Key provider failure diagnostic
- **WHEN** the encryption key provider returns an error
- **THEN** setup SHALL return an error identifying key provider failure without including key contents

#### Scenario: SQLCipher open failure diagnostic
- **WHEN** SQLCipher cannot open the database with the provided key
- **THEN** setup SHALL return an error identifying encrypted database open failure without including key contents

### Requirement: App-owned key storage guidance
The local DB runtime documentation SHALL explain that apps own key creation and storage.

#### Scenario: Consumer reads encryption docs
- **WHEN** a consumer reads encrypted local database guidance
- **THEN** it SHALL explain that the app should read or create a device-local key before DB open, usually from OS secure storage, and that the sync server does not need the key
