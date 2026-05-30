## ADDED Requirements

### Requirement: Optional SQLCipher feature
The Rust workspace SHALL provide optional SQLCipher support for Baresync local database encryption without making encryption mandatory for plaintext users.

#### Scenario: Plaintext build does not require encryption configuration
- **WHEN** Baresync is built without the SQLCipher/encryption feature
- **THEN** plaintext local database usage SHALL continue to compile and run without encryption key providers

#### Scenario: SQLCipher feature builds
- **WHEN** Baresync is built with the SQLCipher/encryption feature enabled
- **THEN** the workspace SHALL compile with the selected `rusqlite` SQLCipher dependency configuration

#### Scenario: Android SQLCipher build verified
- **WHEN** the SQLCipher/encryption feature is enabled for Android
- **THEN** the repository verification process SHALL include Android compile or APK build validation
