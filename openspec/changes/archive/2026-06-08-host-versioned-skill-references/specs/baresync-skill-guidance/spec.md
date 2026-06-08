## ADDED Requirements

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
- **THEN** the installed directory SHALL contain `SKILL.md`
- **AND** detailed `reference/**` files SHALL NOT be required in that installed directory

#### Scenario: Detailed references move to docs

- **WHEN** detailed agent guidance is updated for a release line
- **THEN** the detailed Markdown references SHALL be updated under `apps/docs/public/skills/baresync/<version>/reference/`
- **AND** the bootstrap skill SHALL remain version-routing guidance unless its routing contract changes

## MODIFIED Requirements

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
