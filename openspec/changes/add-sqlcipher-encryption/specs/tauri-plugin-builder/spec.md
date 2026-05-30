## MODIFIED Requirements

### Requirement: Automatic migration startup

The plugin SHALL run configured migrations during plugin setup before exposing managed command state to JS. If encryption is configured, the plugin SHALL obtain the encryption key and open the encrypted database before running migrations.

#### Scenario: setup runs migrations

- **WHEN** the plugin is registered with embedded migrations or a migration path
- **THEN** setup SHALL connect to SQLite through `DbClient`, apply all pending migrations, and only then manage `PluginState`

#### Scenario: setup migration failure stops startup

- **WHEN** a configured migration fails during plugin setup
- **THEN** setup SHALL return an error instead of exposing a partially initialized plugin state

#### Scenario: encrypted setup completes before JS

- **WHEN** the plugin is registered with an encryption key provider
- **THEN** setup SHALL obtain the key, open the encrypted database, apply migrations, and only then expose managed command state to JS

#### Scenario: encryption setup failure stops startup

- **WHEN** the encryption key provider fails or SQLCipher cannot open the database
- **THEN** setup SHALL return an error instead of exposing a partially initialized plugin state

## ADDED Requirements

### Requirement: Builder accepts encryption key provider
The Tauri plugin builder SHALL accept an encryption key provider configuration for apps that opt into encrypted local database storage.

#### Scenario: Builder with encryption provider
- **WHEN** `Builder::new().encryption_key_provider(provider).build()` is registered in a Tauri app
- **THEN** the plugin SHALL use the provider during setup to open or create the encrypted local database

#### Scenario: Builder without encryption provider
- **WHEN** the builder is used without `encryption_key_provider`
- **THEN** the plugin SHALL open or create a plaintext SQLite database
