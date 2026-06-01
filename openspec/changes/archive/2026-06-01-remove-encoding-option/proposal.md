## Why

The `encoding` option (which allowed choosing between JSON and Protobuf) adds API surface, maintenance cost, and documentation burden for a benefit that compression (brotli/gzip at the CDN layer) makes negligible. For typical sync payloads, JSON + brotli is within 1.2× of Protobuf + brotli, so the encoding choice is no longer worth the complexity. We are committing to JSON as the only supported wire format.

## What Changes

- **BREAKING**: Remove the `encoding` field from `SyncClientConfig` (JS Tauri client)
- **BREAKING**: Remove the `encoding` field from `createSyncPushHandler`, `createSyncPullHandler`, `createSyncStatusHandler` options (server handlers)
- **BREAKING**: Remove the `encoding` field from `decodeSyncRequest` and `encodeSyncResponse` (internal service layer)
- **BREAKING**: Remove the `encoding` field from `defineSyncConfig` input and `SyncConfigTableOptions` (generator)
- **BREAKING**: Remove the `encoding: "json"` requirement from all scaffold templates, the inventory example, and the fixture app
- **BREAKING**: Remove the `.encoding()` method from the Rust `BaresyncBuilder` (Tauri plugin) — encoding is always JSON internally
- **BREAKING**: Remove the `encoding` field from `PluginConfig` (Rust) and the log line that includes it
- Update all tests, docs, and examples to no longer pass `encoding: "json"`
- The `protobuf-generator-runtime` capability (which was already empty) remains un-implemented — it is a non-goal

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `json-sync-generator`: The generated contract no longer carries an `encoding` field. `defineSyncConfig` no longer accepts an `encoding` option. The `SyncConfigTableOptions` interface drops the `encoding?: SyncEncoding` field.
- `js-sync-client`: `createSyncClient` no longer accepts `encoding` in its config; the client always uses JSON.
- `tauri-plugin-builder`: `BaresyncBuilder` no longer has an `.encoding()` method. The plugin always serializes/deserializes JSON. The setup log line drops the `encoding=` segment.
- `server-handler-helpers`: `createSyncPushHandler`, `createSyncPullHandler`, `createSyncStatusHandler` no longer accept an `encoding` field in their options. They always decode JSON requests and encode JSON responses.
- `project-scaffolder`: Generated `sync.config.ts`, `routes-hono.ts`, `routes-elysia.ts`, `lib.rs`, and example helper code no longer reference `encoding`.
- `inventory-example`: Example code and docs no longer mention or pass `encoding: "json"`.

## Impact

- All public TypeScript APIs that previously had `encoding: "json"` as a required field
- The Rust `BaresyncBuilder` and its `PluginConfig`
- ~20+ test files in `packages/baresync/src/__test__/` and `packages/baresync/src/{tauri,server,generator,schema}/__test__/`
- The scaffold template files in `packages/create-baresync/src/templates/`
- The `examples/inventory-json-polling/` workspace
- Doc files under `apps/docs/content/docs/{getting-started,reference,generator,server,js-client,local-database}/`
- No new dependencies added; no dependencies removed
- The internal `SyncEncoding` type can remain as the literal `"json"` (used in `SyncRequestKind`) or be removed entirely — design will decide
