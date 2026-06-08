## Purpose

Versioned Baresync skill reference payloads served by `apps/docs` for agents to fetch based on detected project versions.

## Requirements

### Requirement: Docs host skill reference configuration

The docs app SHALL serve a Baresync skill reference config file that declares the docs domain, reference base path, and raw GitHub fallback.

#### Scenario: Config declares docs domain

- **WHEN** `/skills/baresync/config.json` is read
- **THEN** it declares `docsBaseUrl` as `https://baresync.hieka.id`
- **AND** it declares `referencesBasePath` as `/skills/baresync`

#### Scenario: Config declares raw fallback

- **WHEN** `/skills/baresync/config.json` is read
- **THEN** it declares a `fallbackRawBaseUrl` pointing at the repository raw path for `apps/docs/public/skills/baresync`

### Requirement: Docs host versioned skill reference manifests

The docs app SHALL serve versioned Baresync skill reference manifests as static files under `apps/docs/public/skills/baresync/`.

#### Scenario: Current minor manifest is available

- **WHEN** the docs app is built or served
- **THEN** `/skills/baresync/0.4/manifest.json` resolves to a static JSON manifest
- **AND** the manifest identifies the reference version and compatible Baresync package/crate ranges

#### Scenario: Latest manifest is available

- **WHEN** an agent cannot determine a project-specific Baresync version
- **THEN** `/skills/baresync/latest/manifest.json` resolves to a static JSON manifest
- **AND** the manifest identifies which concrete reference line it represents

### Requirement: Hosted manifests reference existing files

Each hosted skill manifest SHALL list reference file URLs that exist in the docs public tree.

#### Scenario: Manifest references server guidance

- **WHEN** `/skills/baresync/0.4/manifest.json` lists a `server` reference URL
- **THEN** that URL resolves to an existing Markdown file under `apps/docs/public/skills/baresync/0.4/reference/`

#### Scenario: Manifest references debug guidance

- **WHEN** `/skills/baresync/0.4/manifest.json` lists a `debug` reference URL
- **THEN** that URL resolves to an existing Markdown file under `apps/docs/public/skills/baresync/0.4/reference/`

### Requirement: Hosted references are version-scoped

Detailed Baresync agent references SHALL be scoped by release line so agents can load guidance matching the consumer project's installed Baresync version.

#### Scenario: Agent needs references for a 0.4 project

- **WHEN** an agent detects that a project uses `baresync` version `0.4.x`
- **THEN** the agent fetches `/skills/baresync/0.4/manifest.json`
- **AND** uses reference URLs from that manifest rather than latest-only guidance

#### Scenario: Agent detects a missing reference line

- **WHEN** an agent detects a Baresync version whose reference line is not hosted
- **THEN** the bootstrap skill instructs the agent to fall back to workspace source inspection or `latest`
- **AND** states the fallback explicitly before relying on fallback guidance

### Requirement: Hosted references are docs assets, not npm package assets

Detailed `reference/**` files SHALL be served from `apps/docs` and SHALL NOT be required inside the `baresync` npm package for `skills install` to succeed.

#### Scenario: Npm package contains only bootstrap skill

- **WHEN** the `baresync` npm package is packed
- **THEN** the package contains `skills/baresync/SKILL.md`
- **AND** the package does not need `skills/baresync/reference/**` for the installer to pass

#### Scenario: Docs public tree contains detailed references

- **WHEN** implementation needs detailed Baresync agent guidance
- **THEN** the detailed Markdown references are present under `apps/docs/public/skills/baresync/<version>/reference/`
