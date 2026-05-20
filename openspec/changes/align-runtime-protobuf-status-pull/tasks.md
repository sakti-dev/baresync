## 1. Preconditions

- [ ] 1.1 Apply and complete `add-status-server-primitives`.
- [ ] 1.2 Confirm status request/response fixtures and JSON/protobuf server primitive tests pass.
- [ ] 1.3 Confirm generated Rust protobuf runtime artifacts include status and pull request/response support.

## 2. Transport Alignment

- [ ] 2.1 Extend the runtime transport trait to support status requests.
- [ ] 2.2 Change pull transport from GET query parameters to POST request bodies.
- [ ] 2.3 Implement JSON POST status and pull transport.
- [ ] 2.4 Implement protobuf POST status and pull transport using generated Rust runtime artifacts.
- [ ] 2.5 Preserve existing push transport, chunking, and 413 split-retry behavior.

## 3. Runtime Orchestration

- [ ] 3.1 Add status result and no-op result types needed by `SyncNowResult`.
- [ ] 3.2 Update `SyncEngine::sync_now` to read local sync state before transfer work.
- [ ] 3.3 Call status with the stored server watermark.
- [ ] 3.4 Implement no-op skip when local dirty count is zero and server status has no changes.
- [ ] 3.5 Implement push-only path when local dirty count is greater than zero and server status has no changes.
- [ ] 3.6 Implement pull-only path when server status has changes and local dirty count is zero.
- [ ] 3.7 Implement full sync path when both local and server changes exist.
- [ ] 3.8 Preserve baseline/full-resync behavior when local state reports `needs_baseline_sync`.
- [ ] 3.9 Preserve rejected-table reconciliation pull after push.

## 4. Tests and Fixtures

- [ ] 4.1 Add canonical status protocol fixtures.
- [ ] 4.2 Add Rust host simulation tests for skip, push-only, pull-only, full sync, and baseline decision branches.
- [ ] 4.3 Add JSON POST pull/status transport tests.
- [ ] 4.4 Add protobuf POST pull/status transport tests.
- [ ] 4.5 Update fixture backend and E2E fixture expectations for POST pull/status if needed.
- [ ] 4.6 Verify JS client tests still assert the same `syncNow()` command shape.

## 5. Verification

- [ ] 5.1 Run relevant Rust core and Tauri plugin tests.
- [ ] 5.2 Run relevant JS client and fixture tests.
- [ ] 5.3 Run E2E fixture smoke in the required JSON/protobuf transport modes if touched.
- [ ] 5.4 Run `bun x ultracite check`.
- [ ] 5.5 Run the package typecheck script.
- [ ] 5.6 Run relevant Cargo checks/tests for changed Rust crates.
