## Why

The current paired generator API requires callers to pass imported schema objects plus a separate `schemaSourceDir` for snapshot copying. That split API is easy to misconfigure and leaves the source-file relationship implicit, which is exactly the part the generator needs to manage frozen schema snapshots correctly.

This change makes the schema source explicit by shifting the paired config toward path-based schema inputs, so generation can reliably load the source files and copy dated snapshots without a second path field that can drift from the actual schema modules.

## What Changes

- **BREAKING** Replace the paired schema object inputs with path-based schema inputs for the generator config.
- **BREAKING** Remove the separate `schemaSourceDir` requirement from the paired config surface.
- Update generator behavior so it loads the API and local schema modules from the provided paths and continues validating paired tables at runtime.
- Keep frozen schema snapshot copying as part of dated generation, but source it directly from the explicit schema file paths.
- Update the Baresync skill reference under `skills/baresync/` to show the new path-based config shape, following the `openspec/knowledge/BARESYNC-SKILL-RUNBOOK.md` source-code → skills → docs sync flow.
- Update the web documentation for generator setup and generated files to match the new API and snapshot workflow, also following the runbook sync flow.
- Update examples, tests, and scaffolding to use the new path-based schema config.

## Capabilities

### New Capabilities

- `schema-path-config`: path-based paired schema configuration for the generator, including loading schema modules from source-file paths and snapshotting those files into dated output.

### Modified Capabilities

- `json-sync-generator`: the paired config API changes from imported schema objects plus `schemaSourceDir` to path-based schema inputs, while preserving paired validation and artifact generation.
- `dated-contract-generation`: generated dated directories continue to include frozen schema snapshots, but the source of those snapshots becomes explicit schema file paths.
- `inventory-example`: the example sync contract package must adopt the new path-based generator config shape.

## Impact

- `packages/baresync/src/generator/*` config and runtime loading logic
- `packages/create-baresync` generated sync-config template
- Inventory example sync-contract config
- Skill reference files under `skills/baresync/`, synchronized from source through the Baresync skill runbook
- Web docs under `apps/docs/content/docs/`, synchronized from the same runbook
- Generator and CLI test fixtures
- OpenSpec specs and follow-on implementation tasks
