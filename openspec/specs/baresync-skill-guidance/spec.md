## Purpose

Agent skill guidance for integrating Baresync with authenticated sync, including header lifecycle, troubleshooting, and testing patterns.

## Requirements

### Requirement: Skills document authenticated sync lifecycle

The Baresync skill guidance SHALL teach agents that authentication is app-owned while sync request header propagation is performed through the shared plugin header store, using `SyncClient.setHeaders` for JS-owned credentials and host-callable Rust logic for Rust-owned credentials.

#### Scenario: Agent wires auth after login

- **WHEN** an agent is helping a consumer integrate Baresync with protected sync routes
- **THEN** the skill guidance SHALL instruct the agent to create the sync client with `createSyncClient({ scopeId, invoke })`
- **AND** after the app obtains a token, call `client.setHeaders({ Authorization: "Bearer <token>" })`
- **AND** start polling or call sync commands only after required headers are set for protected routes

#### Scenario: Agent handles token refresh

- **WHEN** an app refreshes or rotates a session token
- **THEN** the skill guidance SHALL instruct the agent to call `client.setHeaders` with the full replacement header set
- **AND** the guidance SHALL NOT instruct the agent to recreate the sync client, fork the plugin, or add auth-specific sync commands for token refresh

#### Scenario: Agent supports Rust-owned secure storage

- **WHEN** an app stores sync credentials in Rust-owned secure storage or a native keychain
- **THEN** the skill guidance SHALL instruct the agent to update the shared plugin header store through host-callable Rust header logic
- **AND** the guidance SHALL NOT require raw token material to be passed into JS before protected sync can start

#### Scenario: Agent handles logout

- **WHEN** an app logs out or clears the current session
- **THEN** the skill guidance SHALL instruct the agent to stop polling when appropriate
- **AND** call `client.setHeaders({})` or the Rust host-callable header update logic with an empty header set, depending on which side owns the token lifecycle
- **AND** avoid leaving stale session headers in plugin state

### Requirement: Skills prevent app-local sync wrapper drift

The Baresync skill guidance SHALL steer agents away from unnecessary app-local command wrappers, direct fetch-based sync calls, or forked transports when public runtime headers solve the authenticated sync need.

#### Scenario: Agent chooses public header API

- **WHEN** an agent sees a backend `resolveScope` implementation that reads `Authorization`, `X-Api-Key`, or another request header
- **THEN** the skill guidance SHALL instruct the agent to use `client.setHeaders` to pass those headers through plugin-owned sync HTTP requests
- **AND** the guidance SHALL NOT recommend custom app-local `#[command]` wrappers as the default solution

#### Scenario: Agent keeps auth business logic outside Baresync

- **WHEN** an agent implements or documents authenticated sync
- **THEN** the skill guidance SHALL state that login, token storage, token refresh, logout, secure-storage integration, and authorization decisions remain in the consumer app and backend
- **AND** Baresync SHALL be described as transporting the current header set, not managing auth state

### Requirement: Skills document testing for runtime headers

The Baresync skill guidance SHALL include test patterns for JS invocation, Rust command behavior, and server authorization using request headers.

#### Scenario: Agent tests JS setHeaders command shape

- **WHEN** an agent writes frontend tests for authenticated sync wiring
- **THEN** the skill guidance SHALL instruct the agent to mock `invoke`
- **AND** assert that `client.setHeaders({ Authorization: "Bearer test" })` invokes the configured `set_headers` command with `{ headers: { Authorization: "Bearer test" } }`

#### Scenario: Agent tests server authorization separately

- **WHEN** an agent writes server contract tests for authenticated sync
- **THEN** the skill guidance SHALL instruct the agent to use real `Request` objects with auth headers
- **AND** assert that `resolveScope` accepts valid headers and rejects invalid or missing headers before data changes

#### Scenario: Agent tests token refresh behavior

- **WHEN** an agent writes tests for token refresh integration
- **THEN** the skill guidance SHALL instruct the agent to assert that a second `setHeaders` call sends the full replacement header set
- **AND** stale headers are not assumed to remain unless included in the replacement set

#### Scenario: Agent tests Rust-owned header updates

- **WHEN** an agent writes tests for Rust-owned secure-storage sync integration
- **THEN** the skill guidance SHALL instruct the agent to test host-callable header update logic directly
- **AND** assert that JS and Rust update paths write to the same shared plugin header store

### Requirement: Skills document authenticated sync troubleshooting

The Baresync skill guidance SHALL include troubleshooting steps for auth-related sync failures without exposing secret values.

#### Scenario: Agent diagnoses auth HTTP errors

- **WHEN** sync fails with an auth-classified HTTP error such as 401 or 403
- **THEN** the skill guidance SHALL instruct the agent to verify that the app called `setHeaders` after login when JS owns auth
- **AND** verify that Rust host code updated headers when native secure storage owns auth
- **AND** verify that token refresh calls update headers
- **AND** verify that server `resolveScope` reads the same header names the client sets

#### Scenario: Agent avoids logging secrets

- **WHEN** an agent adds debugging or monitoring guidance for sync headers
- **THEN** the skill guidance SHALL instruct the agent to log only metadata such as whether headers were set, HTTP status, and sync state
- **AND** the guidance SHALL prohibit logging token values, API keys, raw headers, or full sync payloads

### Requirement: Skills enumerate impacted reference files

The Baresync skill guidance SHALL enumerate hosted reference categories so setup, UI wiring, plugin, testing, debug, production, and source-routing contexts are discoverable through the versioned docs manifest rather than bundled local `reference/**` files.

#### Scenario: Agent loads setup guidance

- **WHEN** an agent needs setup guidance
- **THEN** the bootstrap skill SHALL route the agent through the selected hosted manifest to the setup reference
- **AND** the setup reference SHALL include where authenticated apps call `setHeaders` in the setup flow

#### Scenario: Agent loads UI guidance

- **WHEN** an agent needs UI framework guidance
- **THEN** the bootstrap skill SHALL route the agent through the selected hosted manifest to the UI framework reference
- **AND** the UI framework reference SHALL include provider patterns for setting headers from auth state before polling protected routes

#### Scenario: Agent loads plugin guidance

- **WHEN** an agent needs Tauri plugin guidance
- **THEN** the bootstrap skill SHALL route the agent through the selected hosted manifest to the Tauri plugin reference
- **AND** the Tauri plugin reference SHALL include the `set_headers` command and shared plugin header-store behavior

#### Scenario: Agent loads operational guidance

- **WHEN** an agent needs debug, testing, production, or source reference guidance
- **THEN** the bootstrap skill SHALL route the agent through the selected hosted manifest to the relevant hosted references
- **AND** those references SHALL mention runtime headers wherever auth failures, mock invoke tests, production token refresh, or source lookup for `createSyncClient` are discussed

### Requirement: Bootstrap skill routes to versioned hosted references

The installed Baresync bootstrap skill SHALL instruct agents to detect the consumer project's Baresync versions and fetch matching hosted references before answering detailed implementation questions.

#### Scenario: Agent handles a project with package manifests
- **WHEN** an agent loads the installed Baresync `SKILL.md` in a project containing `package.json`, `Cargo.toml`, or lockfiles
- **THEN** the bootstrap guidance SHALL instruct the agent to inspect those files for installed `baresync`, `create-baresync`, `baresync-core`, and `tauri-plugin-baresync` versions
- **AND** choose the hosted reference line matching the detected minor version

#### Scenario: Agent fetches detailed guidance
- **WHEN** an agent needs detailed setup, server, schema, debug, testing, or production guidance
- **THEN** the bootstrap skill SHALL instruct the agent to fetch the hosted manifest for the selected reference line
- **AND** fetch only the reference files relevant to the user's task

#### Scenario: Agent cannot fetch hosted references
- **WHEN** hosted references cannot be fetched because network access is unavailable or the docs host is unreachable
- **THEN** the bootstrap skill SHALL instruct the agent to inspect workspace source and local package files
- **AND** avoid answering detailed API behavior from memory

### Requirement: Bootstrap skill remains small and stable

The installed Baresync skill SHALL be a bootstrap document, not the full reference corpus.

#### Scenario: Skill installer copies package skill
- **WHEN** `baresync skills install` copies the bundled skill into a harness directory
- **THEN** the installed directory contains `SKILL.md`
- **AND** detailed `reference/**` files are not required in that installed directory

#### Scenario: Detailed references move to docs
- **WHEN** detailed agent guidance is updated for a release line
- **THEN** the detailed Markdown references are updated under `apps/docs/public/skills/baresync/<version>/reference/`
- **AND** the bootstrap skill remains version-routing guidance unless its routing contract changes
