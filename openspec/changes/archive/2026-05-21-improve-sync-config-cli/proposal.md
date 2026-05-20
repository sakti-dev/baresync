## Why

Baresync now has a paired local/API sync config for JSON, but protobuf still requires a separate config shape and the CLI still expects users to point at a config file. This creates unnecessary friction compared with tools like Drizzle Kit, where running a command from the package directory with a config file present is enough.

## What Changes

- Add `defineProtobufSyncConfig(...)` for protobuf generation from the same paired local/API schema model used by `defineSyncConfig(...)`.
- Allow one `sync.config.ts` file to export both `syncGeneratorConfig` and `protobufSyncGeneratorConfig`.
- Make `baresync generate` discover `sync.config.*` in the current working directory when no config path is passed.
- Make `baresync generate` smart enough to run every recognized config export from the loaded module:
  - `syncGeneratorConfig` for JSON artifacts
  - `protobufSyncGeneratorConfig` for protobuf workspace artifacts
  - recognized default exports
  - legacy `contract` exports
- Add `--config <path>` as the explicit config override while keeping positional config paths for compatibility.
- Update `baresync doctor` to use the same config discovery and contract extraction rules.
- Update docs and examples so `sync.config.ts` is the canonical entrypoint and `baresync generate` is the default command.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `json-sync-generator`: Add config discovery and smart multi-config generation behavior to the CLI.
- `protobuf-generator-runtime`: Add paired-schema protobuf config helper support and route protobuf generation through the same `sync.config.ts` entrypoint.

## Impact

- Affects the public TypeScript generator API.
- Affects `packages/baresync/src/cli.ts` command parsing and config loading.
- Affects docs and examples that show generation commands or protobuf config setup.
- Keeps existing explicit config path and legacy raw contract exports working.
