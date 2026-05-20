## 1. Preconditions

- [x] 1.1 Apply and complete `add-status-server-primitives`.
- [x] 1.2 Confirm status request/response fixtures and JSON/protobuf server primitive tests pass.
- [x] 1.3 Confirm generated Rust protobuf runtime artifacts include status and pull request/response support.

## 2. Transport Alignment

- [x] 2.1 Extend the runtime transport trait to support status requests.
- [x] 2.2 Change pull transport from GET query parameters to POST request bodies.
- [x] 2.3 Implement JSON POST status and pull transport.
- [x] 2.4 Implement protobuf POST status and pull transport using generated Rust runtime artifacts.
- [x] 2.5 Preserve existing push transport, chunking, and 413 split-retry behavior.

## 3. Runtime Orchestration

- [x] 3.1 Add status result and no-op result types needed by `SyncNowResult`.
- [x] 3.2 Update `SyncEngine::sync_now` to read local sync state before transfer work.
- [x] 3.3 Call status with the stored server watermark.
- [x] 3.4 Implement no-op skip when local dirty count is zero and server status has no changes.
- [x] 3.5 Implement push-only path when local dirty count is greater than zero and server status has no changes.
- [x] 3.6 Implement pull-only path when server status has changes and local dirty count is zero.
- [x] 3.7 Implement full sync path when both local and server changes exist.
- [x] 3.8 Preserve baseline/full-resync behavior when local state reports `needs_baseline_sync`.
- [x] 3.9 Preserve rejected-table reconciliation pull after push.

## 4. Tests and Fixtures

- [x] 4.1 Add canonical status protocol fixtures.
- [x] 4.2 Add Rust host simulation tests for skip, push-only, pull-only, full sync, and baseline decision branches.
- [x] 4.3 Add JSON POST pull/status transport tests.
- [x] 4.4 Add protobuf POST pull/status transport tests.
- [x] 4.5 Update fixture backend and E2E fixture expectations for POST pull/status if needed.
- [x] 4.6 Verify JS client tests still assert the same `syncNow()` command shape.

## 5. Verification

- [x] 5.1 Run relevant Rust core and Tauri plugin tests.
- [x] 5.2 Run relevant JS client and fixture tests.
- [x] 5.3 Run E2E fixture smoke in the required JSON/protobuf transport modes if touched.
- [x] 5.4 Run `bun x ultracite check`.
- [x] 5.5 Run the package typecheck script.
- [x] 5.6 Run relevant Cargo checks/tests for changed Rust crates.
