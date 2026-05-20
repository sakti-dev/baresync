## Why

Baresync server primitives support push and pull, but the proven Sakti POS flow also uses a `/status` endpoint to cheaply decide whether a pull is needed and which tables changed. Adding status as a first-class server primitive closes that protocol gap without changing the Tauri plugin or runtime sync behavior yet.

## What Changes

- Extend server request/response primitives to support `kind: "status"` alongside `push` and `pull`.
- Define status request validation around `scopeId` and `cursor`.
- Define the canonical status response shape: `changedTables`, `hasChanges`, `cursor`, and `serverTime`.
- Add JSON status decode/encode coverage.
- Add protobuf status decode/encode coverage using the existing generated protobuf runtime support.
- Keep runtime behavior unchanged: `createSyncClient().syncNow()` and the Rust plugin do not call `/status` as part of this change.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `server-low-level-primitives`: add status request decoding, response encoding, and validation to the existing server primitive contract.
- `protobuf-generator-runtime`: require generated protobuf runtime support for status request and response messages to remain available and covered by parity tests.

## Impact

- `packages/baresync/src/server/service.ts`
- `packages/baresync/src/server/__test__/*`
- `packages/baresync/src/generator/templates/protobuf-runtime.template`
- generated protobuf runtime artifacts under `tests/e2e/generated/protobuf/*`
- sync protocol fixtures if status fixtures are added
- OpenSpec specs for server primitives and protobuf runtime behavior
