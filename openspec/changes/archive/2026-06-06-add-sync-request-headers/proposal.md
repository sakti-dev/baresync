## Why

Baresync's server helpers already support app-owned authorization through `resolveScope({ request })`, but the Tauri sync client has no public way to attach runtime auth headers to the plugin's HTTP requests. Consumer apps with login sessions, bearer tokens, API keys, or refreshed credentials are forced to fork transport behavior, add app-local wrapper commands, or leave authenticated sync ambiguous.

The Baresync agent skill references also omit this lifecycle, so agents can read the documented setup and still fail to implement authenticated sync correctly. This change adds a first-class runtime header API and updates the skill/docs guidance so auth remains app-owned while request header propagation is explicit and reusable.

## What Changes

- Add a JS `SyncClient.setHeaders(headers)` method that replaces the plugin's custom sync request headers at runtime.
- Add an optional JS command-name override for the new header command, preserving testability and legacy wrapper compatibility.
- Add a Tauri plugin command that stores custom sync request headers in plugin-managed state.
- Expose host-callable Rust command logic for native-owned token lifecycles, including secure-storage or keychain flows where JS should not own raw credentials.
- Update the default JSON HTTP transport so every status, pull, and push request applies the current custom headers in addition to `Content-Type: application/json`.
- Optionally add a Rust builder `headers(...)` method for static startup headers, using the same shared header store as runtime `setHeaders`.
- Define header validation, replacement semantics, redaction expectations, token refresh behavior, and in-flight request behavior.
- Update public docs for JS client usage, Tauri commands, builder config, production auth lifecycle, testing, and troubleshooting.
- Update `packages/baresync/skills` so agents know how to wire authenticated sync: create client, set headers after login, refresh headers when tokens rotate, then start or continue polling.
- Update create-baresync scaffold templates and generated starter scripts so new projects start with the same authenticated sync guidance and runtime-header integration surface as the docs.
- No breaking changes: existing clients without custom headers continue making unauthenticated JSON sync requests.

## Capabilities

### New Capabilities

- `baresync-skill-guidance`: Agent-facing Baresync skill guidance for authenticated sync, runtime headers, token refresh, testing, and troubleshooting.
- `project-scaffolder`: Create-baresync templates and generated starter scripts for authenticated sync guidance and runtime header integration.

### Modified Capabilities

- `js-sync-client`: Add the `setHeaders` client method, command-name override, invocation shape, testability, and error propagation requirements.
- `tauri-plugin-builder`: Add plugin command/state behavior for runtime request headers and optional builder-seeded static headers.

## Impact

- TypeScript public API: `SyncClient`, `SyncClientCommands`, `createSyncClient`, tests, and exported type references.
- Rust public/plugin API: `PluginState`, command registration, host-callable command logic for native-owned credentials, default JSON transport construction, optional `Builder::headers`.
- Rust core HTTP behavior: status, pull, and push requests include dynamic custom headers without logging secret values.
- Documentation: JS client pages, Tauri plugin pages, reference API/commands, getting started, production, testing, and troubleshooting pages.
- Agent skills: `packages/baresync/skills/SKILL.md` and relevant `reference/*.md` files must teach auth header lifecycle explicitly.
- Scaffold templates: `packages/create-baresync/src/templates/**` and associated generator tests, especially starter scripts and any bundled auth/setup guidance.
- Verification: TypeScript client unit tests, Rust transport/command tests, docs/skills review, `bun x ultracite check`, and the repo typecheck script.
