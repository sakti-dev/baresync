## Context

Baresync now supports `defineSyncConfig(...)` for JSON-first paired local/API schemas. Protobuf generation still uses `generateProtobufWorkspaceArtifacts(...)` with a manually assembled workspace config, and documentation still tends to present protobuf as a separate config file.

The CLI also requires a config path in common workflows. For package-local generation, users should be able to run `baresync generate` from the directory containing `sync.config.ts`, similar to how Drizzle Kit discovers its config.

## Goals / Non-Goals

**Goals:**

- Add `defineProtobufSyncConfig(...)` that shares the paired local/API schema model with `defineSyncConfig(...)`.
- Keep `sync.config.ts` as the single config entrypoint for JSON and protobuf.
- Make `baresync generate` auto-discover `sync.config.*` from the current working directory.
- Make `baresync generate` run all recognized config exports in the loaded module.
- Make `baresync doctor` use the same discovery and contract extraction rules.
- Preserve compatibility with positional config paths and legacy raw `contract` exports.

**Non-Goals:**

- Do not auto-generate protobuf from a JSON config unless `protobufSyncGeneratorConfig` is explicitly exported.
- Do not remove `generateSyncArtifacts(...)` or `generateProtobufWorkspaceArtifacts(...)`.
- Do not introduce a registry of arbitrary user plugin generators.
- Do not add recursive parent-directory config search in this change.

## Decisions

### Use one config file with named exports

`sync.config.ts` SHALL be the canonical file. It can export `syncGeneratorConfig` for JSON artifacts and `protobufSyncGeneratorConfig` for protobuf artifacts.

This keeps schema wiring in one place while still requiring protobuf outputs to be explicit.

Alternative considered: keep `sync-proto.config.ts`. That separates output modes but makes users maintain two config entrypoints for the same schema model.

### Add `defineProtobufSyncConfig(...)`

`defineProtobufSyncConfig(...)` SHALL accept the same paired schema input as `defineSyncConfig(...)`, force `encoding: "protobuf"`, and return a `ProtobufWorkspaceConfig` with `contract`, `outputDir`, and `outputs`.

The implementation should reuse the shared paired-schema config builder instead of duplicating table validation and drift logic.

Alternative considered: overload `defineSyncConfig(...)` with protobuf outputs. That makes the JSON path heavier and blurs the difference between simple JSON output and protobuf workspace output.

### Make `generate` the one command

`baresync generate` SHALL inspect the loaded config module and run each recognized generation export:

- `syncGeneratorConfig` through `generateSyncArtifacts(...)`
- `protobufSyncGeneratorConfig` through `generateProtobufWorkspaceArtifacts(...)`
- recognized default export by shape
- legacy `contract` export through `generateSyncArtifacts(...)`

This keeps the CLI simple while preserving explicit config exports.

### Add config discovery

When no positional config path and no `--config` value is provided, the CLI SHALL search the current working directory for:

- `sync.config.ts`
- `sync.config.mts`
- `sync.config.js`
- `sync.config.mjs`

`--config <path>` takes precedence over discovery. A positional config path remains supported for backward compatibility.

### Doctor uses the same source resolution

`baresync doctor` SHALL discover or load the same config module, then run diagnostics against every recognized config with a contract. This includes JSON and protobuf generator configs.

## Risks / Trade-offs

- [Risk] A module exporting both JSON and protobuf configs may generate more files than a user expected. -> Mitigation: only recognized named exports run, and protobuf remains explicit through `protobufSyncGeneratorConfig`.
- [Risk] Config discovery may hide where output came from. -> Mitigation: CLI output should print which config path was loaded and which generators ran.
- [Risk] Shape-based default export detection can be ambiguous. -> Mitigation: prefer named exports and keep default export support conservative.
- [Risk] `--output` does not map cleanly to protobuf's multiple outputs. -> Mitigation: apply `--output` to JSON/raw contract generation only in this change.

## Migration Plan

- Add new APIs without removing existing ones.
- Update docs and examples to show `sync.config.ts` with named JSON/protobuf config exports.
- Keep existing command forms working:
  - `baresync generate ./sync.config.ts`
  - `baresync generate --config ./sync.config.ts`
  - `baresync generate` from a directory containing `sync.config.ts`
