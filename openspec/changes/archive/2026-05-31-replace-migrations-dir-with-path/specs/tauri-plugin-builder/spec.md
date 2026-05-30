## MODIFIED Requirements

### Requirement: Automatic migration startup

The plugin SHALL run configured migrations during plugin setup before exposing managed command state to JS.

#### Scenario: setup runs migrations

- **WHEN** the plugin is registered with embedded migrations or a migration path
- **THEN** setup SHALL connect to SQLite, apply all pending migrations, and only then manage `PluginState`

#### Scenario: setup migration failure stops startup

- **WHEN** a configured migration fails during plugin setup
- **THEN** setup SHALL return an error instead of exposing a partially initialized plugin state

## ADDED Requirements

### Requirement: Builder accepts migration path

The `Builder` SHALL accept a `migrations_path` method that configures a path to SQL migration files loaded by the Rust plugin.

#### Scenario: Builder with relative migration path

- **WHEN** `Builder::new().api_base_url("...").migrations_path("migrations").build()` is registered in a Tauri app
- **THEN** the plugin SHALL resolve `migrations` from the Tauri resource directory during setup
- **AND** the plugin SHALL apply `.sql` migrations in filename order during setup and explicit migration commands

#### Scenario: Builder with absolute migration path

- **WHEN** `Builder::new().api_base_url("...").migrations_path("/tmp/app-migrations").build()` is registered in a Tauri app
- **THEN** the plugin SHALL read migration files directly from `/tmp/app-migrations`
- **AND** the plugin SHALL apply `.sql` migrations in filename order during setup and explicit migration commands

### Requirement: Builder rejects multiple migration sources

The `Builder` SHALL reject configurations that provide both embedded migrations and a migration path.

#### Scenario: Embedded and path migrations configured together

- **WHEN** `Builder::new().migrations(vec![...]).migrations_path("migrations").build()` is registered in a Tauri app
- **THEN** plugin setup SHALL fail before exposing managed command state
- **AND** the error message SHALL tell the consumer to choose either embedded migrations or `migrations_path`

## REMOVED Requirements

### Requirement: Builder accepts migrations directory

**Reason**: `migrations_dir` accepts a raw filesystem path and makes relative path behavior depend on the process working directory, which is ambiguous for packaged Tauri apps.

**Migration**: Use `migrations_path(...)`. Relative paths resolve from Tauri's resource directory for production bundles; absolute paths continue to read from the filesystem directly.
