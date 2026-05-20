## 1. Protobuf Config API

- [x] 1.1 Add tests for `defineProtobufSyncConfig(...)` returning a protobuf workspace config.
- [x] 1.2 Refactor paired local/API schema config building so JSON and protobuf helpers share validation logic.
- [x] 1.3 Implement `defineProtobufSyncConfig(...)` with forced protobuf encoding and protobuf workspace outputs.
- [x] 1.4 Export `defineProtobufSyncConfig(...)` and its public types from `baresync/generator` and the root package.

## 2. CLI Config Resolution

- [x] 2.1 Add tests for `baresync generate` auto-discovering `sync.config.ts` in the current working directory.
- [x] 2.2 Add tests for `--config <path>` taking precedence over discovery.
- [x] 2.3 Implement config discovery for `sync.config.ts`, `sync.config.mts`, `sync.config.js`, and `sync.config.mjs`.
- [x] 2.4 Keep positional config paths working for backward compatibility.
- [x] 2.5 Improve missing-config errors so they list the current working directory and searched filenames.

## 3. Smart Generate And Doctor

- [x] 3.1 Add tests for `baresync generate` running both `syncGeneratorConfig` and `protobufSyncGeneratorConfig` from one module.
- [x] 3.2 Implement export detection for `syncGeneratorConfig`, `protobufSyncGeneratorConfig`, recognized default exports, and legacy `contract`.
- [x] 3.3 Route JSON configs through `generateSyncArtifacts(...)` and protobuf configs through `generateProtobufWorkspaceArtifacts(...)`.
- [x] 3.4 Add tests for `baresync doctor` using config discovery and checking every recognized contract.
- [x] 3.5 Update `baresync doctor` to use the same config loading and contract extraction path as `generate`.

## 4. Docs And Examples

- [x] 4.1 Update docs to show one `sync.config.ts` exporting JSON and protobuf configs.
- [x] 4.2 Update generation examples to use `baresync generate` without a config path when run from the config directory.
- [x] 4.3 Update protobuf examples to use `defineProtobufSyncConfig(...)` instead of a separate `sync-proto.config.ts`.
- [x] 4.4 Update the inventory example scripts if they can use the smarter CLI path.

## 5. Verification

- [x] 5.1 Run `bun x ultracite check`.
- [x] 5.2 Run `bun run typecheck`.
- [x] 5.3 Run `bun run inventory:typecheck`.
- [x] 5.4 Run focused package tests for generator config and CLI behavior.
- [x] 5.5 Run `openspec validate improve-sync-config-cli --strict`.
