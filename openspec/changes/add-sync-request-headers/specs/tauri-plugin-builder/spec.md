## ADDED Requirements

### Requirement: Runtime request header command

The plugin SHALL expose a `set_headers` Tauri command and host-callable Rust command logic that replace the custom HTTP headers applied to Baresync sync requests.

#### Scenario: set_headers command stores headers

- **WHEN** the JS client calls `invoke("plugin:baresync|set_headers", { headers: { Authorization: "Bearer token-1" } })`
- **THEN** the plugin SHALL validate the supplied headers
- **AND** the plugin SHALL replace the stored custom sync request headers with the supplied header set

#### Scenario: Rust host code stores headers

- **WHEN** native app code loads a token from Rust-owned secure storage
- **AND** calls the host-callable header update logic with `{ Authorization: "Bearer token-1" }`
- **THEN** the plugin SHALL validate the supplied headers
- **AND** the plugin SHALL replace the same stored custom sync request headers used by the JS `set_headers` command

#### Scenario: set_headers clears headers

- **WHEN** the JS client calls `invoke("plugin:baresync|set_headers", { headers: {} })`
- **THEN** the plugin SHALL clear the stored custom sync request headers
- **AND** later sync HTTP requests SHALL include no custom headers from the previous session

#### Scenario: Rust host code clears headers

- **WHEN** native app code handles logout for a Rust-owned token lifecycle
- **AND** calls the host-callable header update logic with an empty header set
- **THEN** the plugin SHALL clear the stored custom sync request headers
- **AND** later sync HTTP requests SHALL include no custom headers from the previous session

#### Scenario: set_headers rejects invalid headers

- **WHEN** the JS client calls `set_headers` with an invalid HTTP header name or value
- **THEN** the plugin SHALL reject the command before replacing the stored header set
- **AND** the error SHALL NOT include secret header values

#### Scenario: set_headers reserves JSON content type

- **WHEN** the JS client calls `set_headers` with `Content-Type` or a case-insensitive equivalent as a custom header
- **THEN** the plugin SHALL reject the command or ignore that custom header according to the documented behavior
- **AND** the JSON transport SHALL continue setting `Content-Type: application/json`

### Requirement: Custom headers on sync HTTP requests

The default JSON HTTP transport SHALL apply the current custom sync request headers to every status, pull, and push request.

#### Scenario: Status request includes custom headers

- **WHEN** custom sync request headers contain `Authorization: Bearer token-1`
- **AND** the engine sends a status request
- **THEN** the HTTP request SHALL include the `Authorization` header
- **AND** the request SHALL still include `Content-Type: application/json`

#### Scenario: Pull request includes custom headers

- **WHEN** custom sync request headers contain `Authorization: Bearer token-1`
- **AND** the engine sends a pull request
- **THEN** the HTTP request SHALL include the `Authorization` header
- **AND** the request SHALL still include `Content-Type: application/json`

#### Scenario: Push request includes custom headers

- **WHEN** custom sync request headers contain `Authorization: Bearer token-1`
- **AND** the engine sends a push request
- **THEN** the HTTP request SHALL include the `Authorization` header
- **AND** the request SHALL still include `Content-Type: application/json`

#### Scenario: Header updates affect later requests

- **WHEN** a sync request has already captured custom headers for sending
- **AND** `set_headers` replaces the stored header set before a later sync request starts
- **THEN** the in-flight request MAY complete with its captured headers
- **AND** the later request SHALL use the updated header set

### Requirement: Builder accepts static request headers

The plugin builder SHALL accept optional static request headers that seed the same custom header store used by the runtime `set_headers` command.

#### Scenario: Builder seeds headers

- **WHEN** `Builder::new().headers([("X-Api-Key", "static-key")]).build()` is registered
- **THEN** the plugin SHALL initialize custom sync request headers with `X-Api-Key: static-key`
- **AND** sync HTTP requests SHALL include that header until runtime headers are replaced

#### Scenario: Runtime headers replace builder headers

- **WHEN** the builder seeds `X-Api-Key: static-key`
- **AND** the JS client later calls `set_headers` with `Authorization: Bearer token-1`
- **THEN** subsequent sync HTTP requests SHALL use the runtime header set
- **AND** `X-Api-Key: static-key` SHALL NOT remain unless it was included in the runtime replacement set

#### Scenario: Rust runtime headers replace builder headers

- **WHEN** the builder seeds `X-Api-Key: static-key`
- **AND** native app code later calls the host-callable header update logic with `Authorization: Bearer token-1`
- **THEN** subsequent sync HTTP requests SHALL use the runtime header set
- **AND** `X-Api-Key: static-key` SHALL NOT remain unless it was included in the runtime replacement set

#### Scenario: Builder rejects invalid static headers

- **WHEN** the builder is configured with an invalid static header name or value
- **THEN** plugin setup SHALL fail before exposing managed command state
- **AND** the error SHALL NOT include secret header values

## MODIFIED Requirements

### Requirement: Plugin-owned command registration

The plugin SHALL register Baresync DB, migration, sync, polling, and runtime header Tauri commands when `Builder::build()` is registered as a Tauri plugin.

#### Scenario: Commands callable through plugin namespace

- **WHEN** a consumer app registers `tauri_plugin_baresync::builder::Builder::new().build()`
- **THEN** `run_sql`, `run_sql_batch`, `get_db_info`, `run_migrations`, `get_migration_status`, `sync_now`, `sync_push`, `sync_pull`, `sync_full_resync`, `get_sync_local_state`, `purge_synced_outbox`, `run_garbage_collection`, `start_polling`, `stop_polling`, `pause_polling`, `resume_polling`, `get_polling_status`, and `set_headers` SHALL be callable through the Tauri plugin command namespace
- **AND** the consumer app SHALL NOT be required to define app-local `#[command]` wrappers for those commands

#### Scenario: Host-callable command logic remains available

- **WHEN** Rust host tests call command logic directly with constructed plugin state
- **THEN** the same command behavior, including runtime header replacement, SHALL remain testable without launching a Tauri app or WebView

#### Scenario: Native-owned credentials use host-callable logic

- **WHEN** a Tauri app stores sync credentials in Rust-owned secure storage or a keychain
- **THEN** Rust app code SHALL be able to update sync request headers through host-callable plugin logic
- **AND** JS SHALL NOT be required to receive raw token material before polling can use those headers

### Requirement: Consumer plugin registration contract

The Tauri plugin builder integration SHALL document the required configuration a consumer app must provide for production-like sync behavior.

#### Scenario: Required builder inputs documented

- **WHEN** a consumer reads plugin registration guidance
- **THEN** it SHALL describe API base URL, DB path, generated contract metadata, and migration source as explicit integration inputs
- **AND** it SHALL describe optional static request headers only for startup API keys or test configuration
- **AND** it SHALL NOT describe max push bytes, max push rows, transport, or db name as builder inputs because the sync engine uses safe defaults that work across supported platforms and JSON is the supported default transport

#### Scenario: Builder config avoids hidden app coupling

- **WHEN** a consumer registers the plugin
- **THEN** the documented pattern SHALL NOT require private app modules, fixture app modules, Sakti-specific command handlers, or app-local wrappers for Baresync plugin commands

#### Scenario: Runtime user auth remains outside builder config

- **WHEN** a consumer reads plugin registration guidance for user-session authentication
- **THEN** it SHALL explain that runtime user tokens should be passed from JS with `client.setHeaders` when JS owns the token lifecycle
- **AND** it SHALL explain that Rust-owned secure-storage flows may update the same header store through host-callable Rust logic
- **AND** it SHALL NOT require rebuilding or recreating the plugin to update session credentials

### Requirement: Plugin setup logging

The plugin SHALL log configuration and contract resolution at startup using the `log` crate.

#### Scenario: Plugin logs setup info

- **WHEN** the plugin is registered
- **THEN** it SHALL log api_url, db path, and contract tables (upsert_order, delete_order) at info level
- **AND** it SHALL NOT log custom request header values

#### Scenario: Polling logs errors instead of swallowing

- **WHEN** a polling sync cycle fails
- **THEN** the plugin SHALL log the error instead of silently discarding it
- **AND** auth-related HTTP failures SHALL NOT cause token or header values to be logged by the plugin
