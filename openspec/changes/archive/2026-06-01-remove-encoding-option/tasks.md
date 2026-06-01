## 1. JS Sync Client (packages/baresync/src/tauri)

- [x] 1.1 Remove `encoding: "json"` from `SyncClientConfig` in `packages/baresync/src/tauri/client.ts`.
- [x] 1.2 Remove the `encoding` field from any `createSyncClient({...})` call site in tests and docs.
- [x] 1.3 Confirm `createSyncClient({ scopeId, commands?, invoke? })` is the only required shape.

## 2. Server Handler Helpers (packages/baresync/src/server)

- [x] 2.1 Drop `encoding` from `SyncHandlerOptions` and `SyncJsonEncodingConfig` in `packages/baresync/src/server/handlers.ts`.
- [x] 2.2 Remove `encoding` from `createSyncPushHandler`, `createSyncPullHandler`, and `createSyncStatusHandler` call sites and tests.
- [x] 2.3 Remove the `SyncEncoding` type alias if it has no remaining references.
- [x] 2.4 In `service.ts`, drop `encoding: "json"` from `SyncRequestKind`, `decodeSyncRequest`, and `encodeSyncResponse` so internal decoding/encoding is unconditional JSON.

## 3. Sync Generator (packages/baresync/src/generator)

- [x] 3.1 Remove `encoding?: SyncEncoding` from `SyncConfigTableOptions` in `packages/baresync/src/generator/config.ts`.
- [x] 3.2 Remove `encoding?` from the `defineSyncConfig` input type and its implementation; never accept or forward the field.
- [x] 3.3 Confirm the generated `sync-contract.json` no longer contains an `encoding` field.
- [x] 3.4 Confirm `manifest.json` no longer contains an `encoding` field.
- [x] 3.5 Update generator unit tests that assert the previous `encoding` field.

## 4. Rust Plugin Builder (crates/tauri-plugin-baresync)

- [x] 4.1 Remove the `encoding: Option<String>` field and `.encoding()` method from `BaresyncBuilder` in `crates/tauri-plugin-baresync/src/builder.rs`.
- [x] 4.2 Remove the `encoding: String` field from `PluginConfig` in `crates/tauri-plugin-baresync/src/config.rs` and the default impl.
- [x] 4.3 Remove the `encoding` field from `baresync_core::config::Config` in `crates/baresync-core/src/config.rs` and the default impl.
- [x] 4.4 Remove the `encoding` segment from the plugin startup log line.
- [x] 4.5 Ensure integration tests and Tauri permission schemas no longer reference an encoding field.

## 5. Scaffold Templates (packages/create-baresync/src/templates)

- [x] 5.1 Drop `encoding: "json"` from any scaffolded `sync.config.ts`.
- [x] 5.2 Drop `encoding: "json"` from any scaffolded `lib.rs` (Tauri setup) — only call `setup_baresync_plugin` with the remaining required fields.
- [x] 5.3 Drop `encoding: "json"` from scaffolded server route files (Hono and Elysia) and any test fixtures.
- [x] 5.4 Update `templates.test.ts` and `integration-templates.test.ts` assertions to match the new scaffold output.

## 6. Inventory Example (examples/inventory-json-polling)

- [x] 6.1 Drop `encoding: "json"` from `sync.config.ts` in the sync-contract package.
- [x] 6.2 Drop `encoding: "json"` from `apps/server/src/v1/routes.ts` (push, pull, status handlers).
- [x] 6.3 Drop `encoding: "json"` from `apps/app/src/lib/baresync-sync-client.ts` and any other call sites.
- [x] 6.4 Drop `encoding: "json"` from any Rust `setup_baresync_plugin` invocation in `apps/app/src-tauri/src/lib.rs`.
- [x] 6.5 Run `bun run generate` in the sync-contract package to regenerate artifacts without `encoding`; confirm `bunx tsc --noEmit` still passes.

## 7. Fixture App (tests/fixture-app)

- [x] 7.1 Drop `encoding: "json"` from any `defineSyncConfig` or handler factory call site in the fixture schema and routes.

## 8. Documentation (apps/docs)

- [x] 8.1 Remove every `encoding: "json"` reference from the getting-started and reference docs.
- [x] 8.2 Remove every prose mention of "encoding" in the Rust builder docs and the server-routes page.
- [x] 8.3 Update `reference/typescript-api.mdx` so the `createSyncClient` signature, `defineSyncConfig` signature, and handler factory signatures no longer show `encoding`.

## 9. Verification

- [x] 9.1 `cd packages/baresync && bun test` (198 pass / 0 fail)
- [x] 9.2 `cd packages/create-baresync && bun test` (14 pass / 0 fail)
- [x] 9.3 `cd crates/tauri-plugin-baresync && cargo test` (19 pass / 0 fail)
- [x] 9.4 `cd crates/baresync-core && cargo test` (50 pass / 0 fail)
- [x] 9.5 `bun run typecheck` (root) — clean
- [x] 9.6 `bun x ultracite check` (root) — clean (after `ultracite fix`)
- [x] 9.7 `grep -rn "encoding" packages crates examples apps/docs tests` — 0 `encoding: "json"` matches; only 2 test assertions confirming `not.toHaveProperty("encoding")` remain
- [x] 9.8 `openspec status --change remove-encoding-option` — 4/4 artifacts complete, ready to archive
