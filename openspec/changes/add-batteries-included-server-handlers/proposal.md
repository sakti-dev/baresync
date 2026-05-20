## Why

The low-level server primitives have proven useful, but every consumer still has to hand-wire the same decode, validate, authorize, idempotency, ordering, callback, and encode flow. A thin batteries-included server handler layer can remove that repeated protocol plumbing while keeping business writes, reads, and authorization app-owned.

## What Changes

- Add framework-neutral Web `Request -> Response` server handler factories for push, status, and pull.
- Introduce `createSyncPushHandler`, `createSyncStatusHandler`, and `createSyncPullHandler` under the Baresync server export path.
- Require app-provided callbacks for the business-specific parts: `resolveScope`, `applyPushChanges`, `loadSyncStatus`, and `loadPullChanges`.
- Use existing low-level primitives for request decoding, response encoding, push validation, idempotency, and table ordering.
- Support JSON and protobuf through the same typed encoding configuration used by the primitives.
- Document usage patterns for framework adapters such as Hono and Elysia without adding framework-specific dependencies.
- Keep Tauri runtime behavior and `createSyncClient().syncNow()` unchanged in this change.

## Capabilities

### New Capabilities
- `server-handler-helpers`: framework-neutral server handler factories for push, status, and pull that compose the proven Baresync server primitives with app-owned callbacks.

### Modified Capabilities
- None

## Impact

- `packages/baresync/src/server/*`
- `packages/baresync/src/server/__test__/*`
- server export surface for `@repo/baresync/server`
- docs or examples showing Hono and Elysia integration
- depends on `add-status-server-primitives` for first-class status primitive support
