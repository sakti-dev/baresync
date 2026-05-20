## MODIFIED Requirements

### Requirement: CLI generate command

The `packages/baresync/src/cli.ts` module SHALL support `baresync generate` which reads a sync configuration and generates artifacts.

The command SHALL support these config path sources, in precedence order:

1. `--config <path>`
2. Positional config path
3. Auto-discovered config in the current working directory

When auto-discovering config, the command SHALL search the current working directory for:

- `sync.config.ts`
- `sync.config.mts`
- `sync.config.js`
- `sync.config.mjs`

The command SHALL recognize and generate every supported config export in the loaded module:

- `syncGeneratorConfig`
- `protobufSyncGeneratorConfig`
- recognized default export
- legacy `contract` export

#### Scenario: CLI generate produces artifacts

- **WHEN** `bun packages/baresync/src/cli.ts generate` is run with a valid contract configuration
- **THEN** the generator output files are written to the configured output directory

#### Scenario: CLI generate accepts generator config exports

- **WHEN** `baresync generate` loads a config module that exports `syncGeneratorConfig`
- **THEN** the generator output files are written to the config output directory unless the CLI output option overrides it

#### Scenario: CLI generate discovers sync config

- **WHEN** `baresync generate` is run without a config path from a directory containing `sync.config.ts`
- **THEN** the CLI loads that config file
- **AND** it generates the recognized config exports from that file

#### Scenario: CLI generate supports config flag

- **WHEN** `baresync generate --config ./custom-sync.config.ts` is run
- **THEN** the CLI loads `./custom-sync.config.ts`
- **AND** it does not attempt auto-discovery

#### Scenario: CLI generate runs JSON and protobuf configs

- **WHEN** a config module exports both `syncGeneratorConfig` and `protobufSyncGeneratorConfig`
- **THEN** `baresync generate` runs JSON artifact generation for `syncGeneratorConfig`
- **AND** it runs protobuf workspace generation for `protobufSyncGeneratorConfig`

#### Scenario: Missing config shows searched paths

- **WHEN** `baresync generate` is run without a config path from a directory with no supported config file
- **THEN** the CLI fails with an error that names the current working directory and the config filenames it searched

## ADDED Requirements

### Requirement: CLI doctor config discovery

The `packages/baresync/src/cli.ts` module SHALL support `baresync doctor` with the same config path resolution rules as `baresync generate`.

The command SHALL run diagnostics for every recognized config export that contains a sync contract.

#### Scenario: Doctor discovers sync config

- **WHEN** `baresync doctor` is run without a config path from a directory containing `sync.config.ts`
- **THEN** the CLI loads that config file
- **AND** it prints diagnostics for each recognized config export with a contract

#### Scenario: Doctor supports config flag

- **WHEN** `baresync doctor --config ./custom-sync.config.ts` is run
- **THEN** the CLI loads `./custom-sync.config.ts`
- **AND** it does not attempt auto-discovery
