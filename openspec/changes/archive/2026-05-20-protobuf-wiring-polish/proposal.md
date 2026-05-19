## Why

Baresync already models `encoding: "json" | "protobuf"` in the public surface, but protobuf still behaves like a partial path in the implementation: schema validation rejects it in places, the generator is still JSON-first, and there is no explicit policy for protobuf field-number stability or cross-encoding parity. This change finishes the protobuf path so JSON remains the default while protobuf becomes a supported, durable alternative instead of a placeholder.

## What Changes

- Allow protobuf through the public sync contract and runtime configuration instead of rejecting it.
- Add protobuf-aware request decoding, response encoding, and request hashing in the server primitives.
- Extend the generator to emit protobuf-aware metadata from the same Drizzle contract and preserve stable protobuf field numbers across regenerations.
- Introduce a config-driven protobuf generator workspace that emits TS and Rust runtime artifacts from the same reflected schema.
- Encode sync rows as generated protobuf row messages with schema-derived field numbers, not as JSON text nested inside protobuf envelopes.
- Keep JSON fixtures canonical while adding protobuf parity checks derived from the same fixture data.
- Tighten diagnostics around protobuf evolution so field-number reuse and incompatible schema changes fail early.
- Preserve JSON as the public default and keep existing JSON behavior intact.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `schema-helpers`: accept `encoding: "protobuf"` in `defineSyncContract` and `syncSchema` instead of rejecting it.
- `server-low-level-primitives`: make request/response helpers protobuf-aware, including raw wire hashing for protobuf requests.
- `json-sync-generator`: generate protobuf-aware contract metadata and stable field-number outputs from the same reflected schema.
- `protobuf-generator-runtime`: generate config-driven protobuf TS and Rust runtime artifacts from the same reflected schema and output manifest.
- `sync-protocol-fixtures`: keep JSON fixtures canonical while requiring protobuf parity checks from the same fixture set.

## Impact

- `packages/baresync/src/schema/*`
- `packages/baresync/src/server/*`
- `packages/baresync/src/generator/*`
- checked-in generated artifacts and fixtures
- `packages/baresync/src/generated/protobuf/*` and `packages/baresync/src/generator/protobuf-workspace.*`
- `crates/baresync-core` and `crates/tauri-plugin-baresync` once generated Rust runtime wiring is added
- OpenSpec specs and the tests that enforce them
