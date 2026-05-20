## Why

`createSyncClient().syncNow()` is the right public entry point, but the current runtime always begins with pull work even when neither local nor server state changed. With status primitives and server handlers split out, the runtime can make `syncNow()` cheap by checking server status first and can align pull/status transport around POST bodies needed for protobuf.

## What Changes

- Make runtime `sync_now` status-aware while keeping the existing JS `syncNow()` API unchanged.
- Add a runtime status request path that sends the stored cursor and receives `changedTables`, `hasChanges`, `cursor`, and `serverTime`.
- Use local state plus server status to choose skip, push-only, pull-only, full sync, or full resync.
- Align runtime pull and status requests around POST request bodies so JSON and protobuf can share the same protocol shape.
- Add protobuf-capable runtime transport support for status and pull where generated Rust protobuf artifacts are available.
- Preserve push chunking, idempotency, rejected-row reconciliation, cursor advancement, and garbage collection semantics.
- Keep framework-neutral server handlers and low-level server primitive implementation in their separate changes.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `sync-engine-completion`: make `sync_now` status-aware and cheap when no local or server changes exist.
- `sync-pull-client`: align runtime pull transport with POST body semantics and protobuf-compatible request/response handling.
- `sync-protocol-fixtures`: add canonical status fixture coverage and runtime parity coverage for status-driven decisions.
- `rust-engine-simulation`: add host-side simulation for status-aware sync decisions and protobuf status/pull transport behavior.
- `js-sync-client`: preserve the existing `syncNow()` API while documenting that status-aware behavior is implemented behind the Tauri command.

## Impact

- `crates/baresync-core/src/engine.rs`
- `crates/baresync-core/src/pull.rs`
- `crates/baresync-core/src/http.rs`
- generated Rust protobuf runtime artifacts
- Tauri plugin command behavior for `sync_now`
- JS client docs/tests that assert command shape stays stable
- fixture backend and E2E harnesses that simulate runtime sync transport
- depends on `add-status-server-primitives` and benefits from `add-batteries-included-server-handlers`
