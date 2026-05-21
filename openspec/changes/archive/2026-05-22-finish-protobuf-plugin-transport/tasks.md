## 1. Generator Shape

- [x] 1.1 Decide whether generated Rust transport lives in the existing `rustSyncMappers` output or a new `rustTransport` output, and update the protobuf config types accordingly.
- [x] 1.2 Add generator tests that assert protobuf config exposes the selected Rust transport output path.
- [x] 1.3 Extend protobuf workspace generation to render schema-specific Rust value mappers for each synced table.
- [x] 1.4 Add generator tests for row mapper output covering string, bool, int64, double, bytes, and nullable/deleted metadata fields.
- [x] 1.5 Extend generated Rust output with a concrete protobuf transport type or factory compatible with `Arc<dyn SyncHttpTransport>`.
- [x] 1.6 Add generator tests that assert generated transport code contains push, pull, and status request/response handling.
- [x] 1.7 Include generated Rust transport output in protobuf drift detection.

## 2. Rust Transport Behavior

- [x] 2.1 Implement generated push request mapping from engine logical envelope to `SyncPushBatchRequest`.
- [x] 2.2 Implement generated push response decoding from `SyncPushBatchResponse` to the engine acknowledgement shape.
- [x] 2.3 Implement generated pull request mapping from engine logical body to `SyncPullBatchRequest`.
- [x] 2.4 Implement generated pull response decoding from `SyncPullBatchResponse` to the engine pull response shape.
- [x] 2.5 Implement generated status request mapping from engine logical body to `SyncStatusRequest`.
- [x] 2.6 Implement generated status response decoding from `SyncStatusResponse` to the engine status response shape.
- [x] 2.7 Ensure all generated protobuf requests use `Content-Type: application/x-protobuf`.
- [x] 2.8 Return actionable `SyncError::Encoding` errors for unsupported row shapes, missing fields, or protobuf decode failures.
- [x] 2.9 Add Rust compile or fixture tests proving generated transport code builds with `prost` and `baresync-core`.

## 3. Plugin Builder Safety

- [x] 3.1 Add plugin builder validation that fails protobuf encoding when no explicit transport is configured.
- [x] 3.2 Preserve JSON behavior so omitted encoding or `encoding("json")` still uses `JsonHttpTransport` by default.
- [x] 3.3 Add plugin tests for protobuf-without-transport failure and protobuf-with-explicit-transport success.
- [x] 3.4 Add diagnostic text that tells users to pass the generated protobuf transport when protobuf encoding is selected.

## 4. Fixture App And Backend

- [x] 4.1 Regenerate fixture protobuf artifacts with the new Rust transport output.
- [x] 4.2 Replace the fixture app's hand-written `FixtureProtobufTransport` with the generated protobuf transport path.
- [x] 4.3 Keep fixture runtime transport selection shared between app and backend through the existing encoding environment.
- [x] 4.4 Extend backend contract tests to assert protobuf request and response `Content-Type`.
- [x] 4.5 Add backend contract coverage for invalid protobuf body and invalid JSON body diagnostics.
- [x] 4.6 Ensure JSON backend contract behavior remains unchanged.

## 5. E2E And Smoke Coverage

- [x] 5.1 Update desktop smoke setup so protobuf mode uses the generated plugin transport.
- [x] 5.2 Update Android smoke setup so protobuf mode uses the generated plugin transport.
- [x] 5.3 Add or update smoke assertions that verify visible transport mode and backend request evidence for protobuf.
- [x] 5.4 Confirm the same baseline pull, local create, manual sync, backend state, clean local state, and restart persistence assertions run in JSON and protobuf modes.
- [x] 5.5 Update failure evidence guidance to include selected transport mode, app-visible mode, backend mode, and generated artifact freshness checks.

## 6. Public Docs

- [x] 6.1 Update protobuf overview docs to state protobuf is complete only when generated Rust transport is wired into the plugin.
- [x] 6.2 Update enabling-protobuf docs with the full generator, server handler, Rust module import, `prost`, `.encoding("protobuf")`, and `.transport(...)` setup.
- [x] 6.3 Update generated-artifacts docs to describe the generated Rust transport/mappers and how consumers should commit them.
- [x] 6.4 Update Tauri plugin builder docs to explain protobuf transport requirements and the protobuf-without-transport failure.
- [x] 6.5 Update testing docs with consumer-facing protobuf E2E guidance focused on app behavior and wire evidence.
- [x] 6.6 Update troubleshooting/running-in-production docs for server-receives-JSON, protobuf decode failure, stale artifact, and field-number drift scenarios.

## 7. Verification

- [x] 7.1 Run protobuf generator unit tests.
- [x] 7.2 Run server/backend contract tests in JSON and protobuf modes.
- [x] 7.3 Run Rust core and plugin tests that cover transport and builder validation.
- [x] 7.4 Run fixture desktop smoke in JSON mode if local tooling is available.
- [x] 7.5 Run fixture desktop smoke in protobuf mode if local tooling is available.
- [x] 7.6 Run Android smoke in protobuf mode on a connected adb target before claiming Android protobuf smoke verified.
- [x] 7.7 Run `bun x ultracite check`.
- [x] 7.8 Run `bun run typecheck`.
- [x] 7.9 Record any skipped optional smoke commands with the exact missing prerequisite. Initially skipped because `adb devices` reported no connected devices; completed after target `192.168.240.112:5555` was connected.

## 8. Generated Artifact Formatting

- [x] 8.1 Add generator tests for generated-file-only formatting with bundled Prettier fallback.
- [x] 8.2 Add generator tests that Biome config plus local Biome binary formats only generated files and does not invoke Ultracite.
- [x] 8.3 Replace protobuf generator formatting with a shared formatter helper that uses local Biome when available, bundled Prettier otherwise, and `rustfmt` for Rust.
- [x] 8.4 Apply the shared TypeScript/JSON formatting behavior to the plain JSON generator path.
- [x] 8.5 Add `prettier` as a runtime dependency of the public package.
- [x] 8.6 Run generator tests, protobuf drift check, Ultracite, and typecheck.

## 9. Protobuf Simulation Coverage

- [x] 9.1 Add host-side protobuf push simulation coverage for decode, payload validation, row counting, contract ordering, changed rows, deleted IDs, scalar fields, nullable fields, response encoding, and response decoding.
- [x] 9.2 Add protobuf idempotency simulation coverage proving identical protobuf request bytes replay and changed protobuf bytes with the same idempotency key conflict.
- [x] 9.3 Add protobuf pull/status simulation coverage for baseline pull, pagination, mixed changed/deleted rows, delete-only responses, server-wins reconciliation, and cursor/status response semantics.
- [x] 9.4 Run the protobuf simulation tests, protobuf/server regression tests, `openspec validate finish-protobuf-plugin-transport`, `bun x ultracite check`, and `bun run typecheck`.
