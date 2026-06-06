## 1. Rust Header Store And Transport

- [x] 1.1 Add a shared sync request header store type that can be cloned into plugin state and the default HTTP transport.
- [x] 1.2 Implement header validation using HTTP header parsing types instead of ad hoc string checks.
- [x] 1.3 Define and implement the documented `Content-Type` behavior for custom headers, preferring a clear rejection with a non-secret error.
- [x] 1.4 Update `JsonHttpTransport` so status, pull, and push requests snapshot custom headers before request construction.
- [x] 1.5 Preserve `Content-Type: application/json` on every JSON transport request.
- [x] 1.6 Ensure transport logs do not include custom header names, header values, tokens, API keys, or full sync payloads.
- [x] 1.7 Add focused Rust tests proving custom headers are applied to status, pull, and push requests.
- [x] 1.8 Add Rust tests proving later header updates affect later requests without mutating an already captured request snapshot.

## 2. Tauri Plugin Command And Builder

- [x] 2.1 Add custom header store ownership to `PluginState` without disturbing existing DB, polling, migration, or event fields.
- [x] 2.2 Add host-callable `set_headers_with_state` command logic that validates and replaces the full custom header set.
- [x] 2.3 Ensure Rust/native app code can call the host-callable header update logic for secure-storage or keychain-owned token flows.
- [x] 2.4 Add the Tauri `#[command] set_headers` wrapper with the JS argument shape `{ headers }`.
- [x] 2.5 Make the Tauri command delegate to the same host-callable logic used by Rust/native callers.
- [x] 2.6 Register `commands::set_headers` in the plugin namespace inside `Builder::build()`.
- [x] 2.7 Update test state builders and existing command tests for the new `PluginState` field.
- [x] 2.8 Add Rust command tests for storing headers, clearing headers, rejecting invalid names, rejecting invalid values, and preserving old headers after failed validation.
- [x] 2.9 Add Rust tests proving JS-command and Rust-host update paths write to the same shared header store.
- [x] 2.10 Add `Builder::headers(...)` for optional static startup headers if implementation complexity stays reasonable.
- [x] 2.11 Seed builder-provided static headers into the same shared store used by runtime `set_headers`.
- [x] 2.12 Add builder tests for static headers, JS runtime replacement of static headers, Rust runtime replacement of static headers, and invalid static header setup failure.

## 3. JavaScript Sync Client API

- [x] 3.1 Extend `SyncClientCommands` with optional `setHeaders?: string`.
- [x] 3.2 Add the default command name `plugin:baresync|set_headers`.
- [x] 3.3 Extend the `SyncClient` interface with `setHeaders(headers: Record<string, string>): Promise<void>` or the final chosen return type.
- [x] 3.4 Implement `client.setHeaders(headers)` with the exact command argument shape `{ headers }`.
- [x] 3.5 Update root and `baresync/tauri` exports if any new public header types are introduced.
- [x] 3.6 Add JS unit tests that `createSyncClient` returns `setHeaders`.
- [x] 3.7 Add JS unit tests for default `setHeaders` command invocation.
- [x] 3.8 Add JS unit tests for custom `setHeaders` command overrides.
- [x] 3.9 Add JS unit tests proving `setHeaders` propagates rejected invoke errors unchanged.
- [x] 3.10 Add JS unit tests proving repeated `setHeaders` calls send full replacement sets for token refresh.

## 4. Public Web Docs

- [x] 4.1 Update JS client overview docs to list runtime request headers as a sync-client responsibility.
- [x] 4.2 Update `create-sync-client` docs with `setHeaders`, command shape, return type, replacement semantics, clearing headers, and token refresh examples.
- [x] 4.3 Update JS client testing docs with mocked `setHeaders` invocation tests and token refresh tests.
- [x] 4.4 Update JS client error-handling docs to explain auth-expiry handling remains app-owned and `setHeaders` validation errors propagate.
- [x] 4.5 Update frontend wiring docs to show setting headers after login and before starting polling for protected sync routes.
- [x] 4.6 Update TypeScript API reference with `setHeaders`, `SyncClientCommands.setHeaders`, and examples.
- [x] 4.7 Update command reference docs with `plugin:baresync|set_headers` and the `{ headers }` argument shape.
- [x] 4.8 Update Tauri plugin overview docs so "Authorization headers" no longer implies Baresync has no header propagation API.
- [x] 4.9 Update Tauri plugin commands docs with `set_headers`, validation, clearing, and secret-redaction behavior.
- [x] 4.10 Update Tauri plugin builder docs with optional static `.headers(...)` only if the builder API is implemented.
- [x] 4.11 Update running-in-production troubleshooting docs with missing/expired header diagnosis for 401/403 sync errors.
- [x] 4.12 Add or update authenticated sync guidance in production docs, including JS-owned login, Rust-owned secure-storage flows, refresh, logout, and no-secret-logging practices.

## 5. Baresync Agent Skills

- [x] 5.1 Update `packages/baresync/skills/SKILL.md` essential pieces and concepts to include runtime request headers and `setHeaders`.
- [x] 5.2 Update `packages/baresync/skills/reference/setup.md` with authenticated brownfield setup: JS-owned `setHeaders`, Rust-owned secure-storage header updates, start polling after headers, refresh headers, clear on logout.
- [x] 5.3 Update `packages/baresync/skills/reference/ui-frameworks.md` with React/Solid/provider patterns for auth-state-driven `setHeaders` and notes for Rust-owned credentials where JS should not receive tokens.
- [x] 5.4 Update `packages/baresync/skills/reference/tauri-plugin.md` with the `set_headers` command, host-callable Rust header update logic, shared header store, transport behavior, and optional builder static headers.
- [x] 5.5 Update `packages/baresync/skills/reference/debug.md` with 401/403 troubleshooting steps that check JS `setHeaders`, Rust secure-storage header updates, token refresh, header names, and server `resolveScope`.
- [x] 5.6 Update `packages/baresync/skills/reference/testing.md` with mocked JS `setHeaders` tests, Rust host-callable header update tests, server `Request` auth tests, and token refresh replacement tests.
- [x] 5.7 Update `packages/baresync/skills/reference/production.md` with JS-owned and Rust-owned runtime auth lifecycles, logout clearing, and no-secret-logging rules.
- [x] 5.8 Update `packages/baresync/skills/reference/source.md` so agents can find the JS client, plugin command, builder, and transport files for request-header behavior.
- [x] 5.9 Review all skill references for stale advice that suggests app-local wrappers, direct fetch calls, forked transports, or auth-specific plugin commands as the default authenticated sync solution.
- [x] 5.10 Ensure skill wording is direct enough for agents: use `setHeaders` when JS owns credentials, use Rust host-callable updates when native secure storage owns credentials, keep auth business logic app-owned, do not log secrets, and do not recreate the client for token refresh.

## 6. Examples And Fixture Impact

- [x] 6.1 Audit fixture app and inventory example startup flows for protected-route assumptions.
- [x] 6.2 Update examples only where they discuss auth or production wiring; keep unauthenticated examples simple if they do not need headers.
- [x] 6.3 Add a small example snippet showing login/token refresh integration without introducing a full auth system.
- [x] 6.4 Confirm no scaffolded code or docs imply `setHeaders` is required for unauthenticated local development.

## 7. Scaffold Templates

- [x] 7.1 Update `packages/create-baresync/src/templates/app/sync-client.ts` so the generated starter client shows the authenticated sync flow with `setHeaders`, token refresh replacement, and polling order.
- [x] 7.2 Update `packages/create-baresync/src/templates/root/README.md` so the generated starter README explains JS-owned and Rust-owned auth/header lifecycles.
- [x] 7.3 Update `packages/create-baresync/src/templates/server/fallback-instructions.md` so manual server setup reminds users about request headers and `resolveScope`.
- [x] 7.4 Update `packages/create-baresync/src/scaffold.ts` so generated completion output mentions request-header setup for protected sync routes.
- [x] 7.5 Update scaffold tests in `packages/create-baresync/src/__test__/` to assert that generated templates and next-step output mention the auth/header lifecycle.
- [x] 7.6 Update `packages/create-baresync/src/templates/root/package.json` and `packages/create-baresync/src/templates/app/package.json` script templates if they need wording or naming changes to stay aligned with the auth/header flow.
- [x] 7.7 Review template package scripts and starter helper files for wording that could mislead users into app-local auth wrappers or direct fetch-based sync.

## 8. Security And Behavior Review

- [x] 8.1 Verify every custom-header error path avoids echoing header values.
- [x] 8.2 Verify logs do not include token values, API keys, raw headers, or full sync payloads.
- [x] 8.3 Verify invalid header updates are atomic: failed validation does not partially replace the previous header set.
- [x] 8.4 Verify clearing headers on logout is documented and tested.
- [x] 8.5 Verify JS and Rust runtime update paths cannot diverge because they write to the same shared store.
- [x] 8.6 Verify `setHeaders` and Rust header updates are plugin-wide and document implications for apps with multiple simultaneous authenticated sessions.

## 9. Verification

- [x] 9.1 Run targeted JS client tests for `packages/baresync/src/tauri`.
- [x] 9.2 Run targeted Rust tests for `baresync-core` HTTP transport behavior.
- [x] 9.3 Run targeted Rust tests for `tauri-plugin-baresync` command and builder behavior.
- [x] 9.4 Run docs/skills text searches for stale mentions of auth headers that contradict the new API.
- [x] 9.5 Run `bun x ultracite check`.
- [x] 9.6 If Ultracite reports safe fixable issues, run `bun x ultracite fix` and then rerun `bun x ultracite check`.
- [x] 9.7 Run the repository typecheck script and fix any type errors.
- [x] 9.8 Record any verification commands that cannot run, including the blocker and residual risk.
