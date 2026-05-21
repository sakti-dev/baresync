## Why

Baresync currently exposes protobuf as a sync encoding, generates TypeScript and Rust protobuf artifacts, and supports protobuf at the TypeScript server boundary, but a normal Tauri app cannot enable protobuf end to end through the public plugin surface. The result is misleading: `.encoding("protobuf")` stores a config value while the default Rust transport still sends JSON unless the app provides a custom, schema-specific transport.

This change finishes protobuf as a user-facing app sync feature: users who generate protobuf artifacts should be able to wire the generated Rust transport into `tauri-plugin-baresync` and verify that their app sends `application/x-protobuf` sync traffic to a protobuf-aware server.

## What Changes

- Generate a schema-specific Rust protobuf HTTP transport alongside the existing generated Rust prost message structs.
- Keep the core sync engine's logical push/pull/status flow JSON-shaped internally, but make protobuf a generated transport/codec layer that encodes outbound logical envelopes and decodes inbound responses.
- Add a public, documented Tauri wiring path for protobuf apps, including the generated transport import and plugin builder configuration.
- Make `.encoding("protobuf")` meaningfully validated: protobuf mode must not silently fall back to JSON transport in production-like app wiring.
- Replace fixture-only protobuf transport code with generated or generator-equivalent protobuf transport code so tests exercise the same public pattern users follow.
- Extend E2E/fixture coverage so protobuf smoke paths prove real plugin sync traffic uses protobuf request and response bodies, not only server-side encode/decode parity.
- Update public docs to describe the complete protobuf support boundary and remove guidance that implies `.encoding("protobuf")` alone changes the wire format.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `protobuf-generator-runtime`: emit schema-specific Rust protobuf transport/mappers in addition to prost structs and TypeScript runtime artifacts.
- `tauri-plugin-builder`: support a safe public protobuf plugin wiring path and prevent misleading protobuf configuration that still uses the default JSON transport.
- `public-fixture-device-e2e`: prove the public fixture app can run the same smoke scenario in JSON and protobuf modes using the public/generated protobuf transport path.
- `fixture-backend-contracts`: continue verifying protobuf server request/response parity and add assertions that protobuf mode uses protobuf content types and binary bodies where observable.
- `consumer-integration-hardening`: document and validate the user-facing protobuf integration checklist for generated artifacts, plugin transport wiring, server handlers, and test evidence.

## Impact

- `packages/baresync/src/generator/protobuf-workspace.ts` and related generator tests.
- Generated protobuf artifacts under `tests/e2e/generated/protobuf` and any example-generated protobuf outputs.
- `crates/baresync-core/src/http.rs` transport trait usage and tests around transport selection/errors.
- `crates/tauri-plugin-baresync/src/builder.rs`, config validation, and plugin tests.
- `tests/fixture-app/src-tauri/src/lib.rs` fixture transport wiring.
- `tests/e2e/backend/*`, desktop/Android smoke commands, and transport-mode test matrix.
- Public docs under `apps/docs/content/docs/protobuf`, `tauri-plugin`, `running-in-production`, and `testing`.
- Rust dependency surface may need `prost` in consumer Tauri apps when protobuf transport is generated.
