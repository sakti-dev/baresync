## ADDED Requirements

### Requirement: Publish script packaging matches package manifest

The repository publish script SHALL stage Baresync skill files in a package path that is included by `packages/baresync/package.json`.

#### Scenario: Publish script ignores package lifecycle scripts

- **WHEN** `scripts/publish.sh` publishes `packages/baresync` using `npm publish --ignore-scripts`
- **THEN** the staged package SHALL include `skills/baresync/SKILL.md`
- **AND** `package.json` SHALL include `skills` in the published files list

#### Scenario: Publish script stages no external skill corpus

- **WHEN** `scripts/publish.sh` prepares the `baresync` npm package
- **THEN** it SHALL NOT depend on copying root-level `skills/baresync/reference/**` into the package
- **AND** it SHALL NOT depend on `.pack` staging for skill install correctness

### Requirement: Package artifact regression covers ignored scripts

The test suite SHALL verify that a package artifact created with lifecycle scripts ignored still includes the bootstrap skill.

#### Scenario: Npm pack ignores lifecycle scripts

- **WHEN** a test creates a staged package with `skills/baresync/SKILL.md`
- **AND** runs `npm pack --ignore-scripts`
- **THEN** the packed file list SHALL include `skills/baresync/SKILL.md`

## MODIFIED Requirements

### Requirement: Skill files are included in npm package

The published npm package SHALL include the `skills/baresync/SKILL.md` bootstrap skill directly under the package root and SHALL NOT require a generated `.pack` directory for skill installation.

#### Scenario: Package contains bootstrap skill

- **WHEN** user installs `baresync` via npm/bun/pnpm
- **THEN** `node_modules/baresync/skills/baresync/SKILL.md` SHALL exist
- **AND** `node_modules/baresync/skills/baresync/reference/` SHALL NOT be required for `baresync skills install` to succeed

#### Scenario: Package is published with ignored scripts

- **WHEN** `baresync` is packed or published with lifecycle scripts ignored
- **THEN** the package SHALL still include `skills/baresync/SKILL.md`
- **AND** the installed CLI SHALL be able to copy that bootstrap skill into target harness directories
