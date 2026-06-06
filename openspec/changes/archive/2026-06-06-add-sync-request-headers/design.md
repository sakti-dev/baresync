## Context

Baresync currently separates app authentication from sync protocol behavior. The server helpers call `resolveScope({ scopeId, context, request })`, so a consumer backend can authorize each status, pull, and push request from the raw `Request`. That side is already flexible enough for bearer tokens, API keys, custom headers, and session-derived scope checks.

The missing side is the Tauri client runtime. The JS `SyncClient` invokes plugin commands, and the Rust plugin owns HTTP requests through `baresync-core`'s default `JsonHttpTransport`. The default transport always sends JSON bodies with `Content-Type: application/json`, but it has no app-facing path for runtime auth headers. Apps can authenticate users, but they cannot tell the reusable sync transport which headers to include without forking the plugin, adding app-local commands, or replacing the transport.

The current agent-facing Baresync skills reinforce this gap. They explain scope, polling, local writes, server `resolveScope`, and error handling, but they do not teach the runtime auth lifecycle: obtain token, set sync request headers, start polling, refresh headers when the token changes, and troubleshoot missing headers. This change must update both implementation contracts and skill guidance so agents stop inventing private sync wrappers.

## Goals / Non-Goals

**Goals:**

- Add a generic runtime header API: `client.setHeaders(headers: Record<string, string>)`.
- Support native-owned runtime header updates through host-callable Rust command logic for secure-storage/keychain flows.
- Store custom sync request headers in plugin-managed shared state that the default transport reads for status, pull, and push.
- Preserve app-owned authentication: Baresync propagates headers, but it does not login, refresh tokens, inspect claims, or decide authorization.
- Support bearer tokens, API keys, Basic auth, and custom tenant/session headers without adding auth-scheme-specific APIs.
- Make header updates dynamic so consumers can call `setHeaders` after login, after token refresh, after logout, and before or during polling.
- Keep default behavior unchanged for consumers that never set headers.
- Document security-sensitive behavior clearly: replacement semantics, validation, no secret logging, and troubleshooting.
- Update `packages/baresync/skills` so agents know the expected authenticated sync lifecycle and test patterns.

**Non-Goals:**

- Do not add `setAuthToken`, refresh-token storage, automatic refresh, OAuth helpers, keychain implementation, or session persistence.
- Do not move scope authorization into Baresync server helpers. Server `resolveScope` remains app-owned.
- Do not make headers part of the sync JSON payload or generated sync contract.
- Do not require authenticated sync for public fixture apps or unauthenticated local examples.
- Do not support per-request callback hooks from JS into Rust; headers are set through explicit JS or Rust runtime calls.
- Do not log header names or values unless the implementation can guarantee no secret disclosure. Prefer not logging custom header details at all.

## Decisions

### Use generic `setHeaders` instead of auth-specific APIs

The JS client will expose `setHeaders(headers: Record<string, string>): Promise<unknown>`. The command payload will be `{ headers }`, and the default command name will be `plugin:baresync|set_headers`.

This is intentionally generic. Apps can set:

```ts
await client.setHeaders({ Authorization: `Bearer ${token}` });
await client.setHeaders({ "X-Api-Key": apiKey });
await client.setHeaders({
  Authorization: `Bearer ${token}`,
  "X-Workspace-Id": workspaceId,
});
```

Alternative considered: `setAuthToken(token)` or `setBearerToken(token)`. Rejected because it bakes in one auth scheme, does not cover API keys or custom tenant headers, and creates pressure for more one-off commands like `setRefreshToken` or `setTenantId`.

### `setHeaders` replaces the custom header set

Each `setHeaders` call replaces all previously configured custom headers. Passing `{}` clears custom headers.

Replacement semantics are easier to reason about than merge semantics during login/logout/token refresh. They avoid stale headers such as a removed `X-Workspace-Id` continuing to ride along after the app updates only `Authorization`.

Alternative considered: merge new headers into the existing map. Rejected because it makes header removal ambiguous and can leak stale auth context across scope/session changes.

### Runtime headers live in one shared plugin/transport state

The plugin should create one shared header store during setup and wire it into both `PluginState` and the default HTTP transport. Sync commands clone `SyncEngineConfig`, but the transport is an `Arc<dyn SyncHttpTransport>`, so storing mutable headers behind the transport keeps header updates visible across new engine instances and polling cycles.

Conceptually:

```text
JS client.setHeaders({ ... }) ─┐
Tauri set_headers command      ├─▶ SharedSyncRequestHeaders
Rust set_headers_with_state    ┘
                                    |
                                    v
JsonHttpTransport status/pull/push request builder
```

There are three intended writers into the same store:

- JS runtime path: `client.setHeaders(...)`, for apps where JS owns login/session refresh/logout.
- Rust host path: `set_headers_with_state(...)`, for native-owned secure storage, keychain-backed sessions, native refresh flows, host tests, or apps that intentionally avoid exposing tokens to JS.
- Builder path: `.headers(...)`, for static startup defaults such as fixed API keys or test configuration.

All three paths must use the same validation and replacement semantics. The JS command should call the Rust host-callable logic rather than duplicating header storage behavior.

The transport must snapshot headers before applying them to a request. A request that already captured headers can finish with that snapshot; later runtime header updates affect later requests. This avoids holding a mutex while sending HTTP.

Alternative considered: store headers directly on `SyncEngineConfig`. Rejected because engine configs are cloned per command/scope and would make runtime mutation less reliable across background polling. A shared transport/header store matches the existing `Arc` transport model.

### Rust runtime updates are supported without creating a second source of truth

Native safe storage changes who owns credentials, not where sync headers live. When an app stores tokens in a Rust-side keychain or secure storage layer, native code should be able to read the token and call a host-callable function such as `set_headers_with_state(&PluginState, headers).await`. That function updates the same header store as the JS `setHeaders` command.

This enables flows like:

```text
App starts
        |
        v
Rust loads token from secure storage
        |
        v
Rust set_headers_with_state({ Authorization: "Bearer <token>" })
        |
        v
JS creates client and starts polling
```

It also supports native refresh flows where Rust updates headers when it rotates a token. JS remains the documented common path for JS-owned auth state, but it is not the only runtime path.

Alternative considered: require native secure-storage flows to send tokens back to JS and call `client.setHeaders`. Rejected because some apps deliberately keep session material out of the WebView.

Alternative considered: add a separate Rust-only header store. Rejected because two stores would make precedence and debugging unclear. All writers must converge on one plugin header store.

### Builder static headers seed the same store

The Rust builder can expose `.headers(...)` for static startup headers, but this is secondary to runtime updates. If implemented, builder headers seed the same shared header store used by `set_headers` and `set_headers_with_state`, and a later runtime update replaces them.

This supports test setups, service-to-service API keys, or deployments with static headers. It must not become the primary documented path for user session auth, because user tokens usually become available after login and can refresh.

Alternative considered: skip builder headers entirely. That would be acceptable for the core auth problem, but a static builder seed is useful for non-user API keys and matches the user's requested surface. If implementation complexity rises, it can be deferred without blocking runtime header updates.

### Header update ownership depends on where credentials live

The docs and skills should describe the ownership rule directly:

- If JS owns the token lifecycle, use `client.setHeaders`.
- If Rust/native owns the token lifecycle through secure storage, keychain, or native refresh, use host-callable Rust header logic.
- If headers are static at startup, use builder `headers(...)` if implemented.

All paths replace the same custom header set. None of them make Baresync responsible for login, refresh-token persistence, OAuth, or server authorization.

Alternative considered: document only the JS path. Rejected because native safe-storage flows are common in Tauri apps and may intentionally avoid exposing tokens to JS.

### Validate header names and values before storing

The Rust update path should reject invalid header names or values before replacing the stored map. Validation should use HTTP header parsing types where practical (`reqwest::header::HeaderName` and `HeaderValue`, or compatible `http` types already available through dependencies) rather than ad hoc string checks.

Validation requirements:

- Empty names are rejected.
- Invalid HTTP header names are rejected.
- Invalid HTTP header values are rejected.
- `Content-Type` is reserved and should be rejected or ignored as a custom header so the JSON transport remains deterministic.
- Header values are not logged in validation errors.

Alternative considered: accept arbitrary strings and let `reqwest` fail later. Rejected because it moves errors from the explicit header update call to a later sync cycle, making diagnosis harder.

### Apply custom headers to every sync HTTP request

The default JSON transport must apply the current custom headers to:

- `POST {api_url}/status`
- `POST {api_url}/pull`
- `POST {api_url}/push`

The transport still sets `Content-Type: application/json` itself. Custom headers are additive, not a replacement for JSON behavior.

Alternative considered: pass headers only to push/pull and leave status unauthenticated. Rejected because status is part of the same scoped sync authorization flow and `resolveScope` may authorize all three routes.

### Keep server behavior unchanged

Server route helpers already receive the raw `Request`, so they can inspect `request.headers.get("Authorization")`, `request.headers.get("X-Api-Key")`, or any app-defined header. No server helper API changes are needed.

Docs and skills should show how a backend uses `resolveScope` with headers, but Baresync should not prescribe the auth implementation.

### Update docs and skills as part of the contract

This change is not complete unless public docs and agent skills teach the same behavior. Required guidance:

- Auth is app-owned; Baresync transports headers.
- Create the sync client once.
- If JS owns credentials, after login call `setHeaders`.
- If Rust owns credentials, load from secure storage and call the Rust header update function.
- Start polling only after required auth headers are set for protected routes.
- On token refresh, update headers through the owner of the token lifecycle.
- On logout, clear headers through the same owner, stop polling, and clear app session state as appropriate.
- Do not log header values, tokens, or full sync payloads.
- In tests, assert the `set_headers` command shape, Rust host-callable behavior, and authenticated server requests.

The skills need direct, imperative instructions because they guide agents during integration. They should call out that agents must not invent app-local sync commands or direct HTTP fetches to solve authenticated sync.

### Update scaffold templates so new projects inherit the same auth guidance

The create-baresync scaffold is part of the public contract. A new project generated from the scaffold should not have to reverse-engineer the docs to learn authenticated sync.

The scaffold should teach the default integration path through generated files and startup instructions:

- `packages/create-baresync/src/templates/app/sync-client.ts` should show the JS-owned header flow with `client.setHeaders(...)`, `startPolling()`, and token refresh replacement semantics.
- `packages/create-baresync/src/templates/root/README.md` should explain the auth lifecycle in plain startup language, including JS-owned credentials and the existence of Rust-owned secure-storage flows.
- `packages/create-baresync/src/templates/server/fallback-instructions.md` should remind users that server `resolveScope` reads request headers and that the scaffold does not own auth.
- `packages/create-baresync/src/scaffold.ts` should surface auth/header next steps in the final generated output so the user does not miss them.
- Template and scaffold tests should assert that generated files mention the header lifecycle and do not point users at app-local auth wrapper commands as the default solution.

The scaffold should remain beginner-friendly. It should not turn into a full auth framework, but it should be explicit enough that a generated starter project points users toward the correct header API on the first pass.

## Risks / Trade-offs

- [Risk] Headers change while a sync request is in flight, causing one request to use an old token. Mitigation: document snapshot semantics and require retry/auth-expiry handling in the app; later requests use the new header set.
- [Risk] Secret values leak through logs or failure messages. Mitigation: do not log custom header values; validation errors mention only invalid names or generic invalid values.
- [Risk] `Content-Type` override breaks JSON transport. Mitigation: reserve `Content-Type` and keep it transport-owned.
- [Risk] Skills become stale and agents regress. Mitigation: update skill references in the same implementation tasks and include explicit skill review checks.
- [Risk] Builder headers, JS runtime headers, and Rust runtime headers conflict. Mitigation: define one shared store with full replacement semantics from every writer.
- [Risk] Native secure-storage guidance makes Baresync look responsible for auth persistence. Mitigation: state that Baresync only accepts the current header set; keychain and token refresh implementation remain app-owned.
- [Risk] Scaffold output drifts from docs and skills. Mitigation: update create-baresync templates and scaffold tests in the same change so the generated starter mirrors the documented flow.
- [Risk] Header state spans scopes in one plugin instance. Mitigation: document that headers are plugin-wide, while `scopeId` remains per client. Apps with multiple simultaneous authenticated users should use one active session per plugin instance or include all required auth context in the current header set.
- [Risk] Tests overfit to header map ordering. Mitigation: tests should assert semantic header presence, not iteration order.

## Migration Plan

This is additive. Existing unauthenticated apps keep working without changes.

Implementation sequence:

1. Add shared header-store types and validation in Rust.
2. Wire the default JSON transport to read the header store for status, pull, and push requests.
3. Add plugin state, command registration, host-callable command logic, and tests.
4. Add JS `setHeaders` command defaults, interface method, command override, and unit tests.
5. Add optional builder static headers if included in the first implementation.
6. Add or update docs for JS client, Tauri commands, builder, references, production, testing, troubleshooting, and getting started.
7. Update `packages/baresync/skills` with explicit authenticated sync lifecycle guidance for JS-owned and Rust-owned credentials.
8. Run Ultracite and typecheck, plus targeted Rust and JS tests.

Consumer migration for protected sync routes when JS owns credentials:

1. Keep `resolveScope` on the server as the authorization boundary.
2. Create the JS sync client once with `scopeId` and `invoke`.
3. After login, call `client.setHeaders({ Authorization: "Bearer <token>" })`.
4. Start polling after headers are set, or call `syncNow` manually after headers are set.
5. On token refresh, call `client.setHeaders` with the new token.
6. On logout, stop polling and call `client.setHeaders({})`.

Consumer migration for protected sync routes when Rust owns credentials:

1. Keep `resolveScope` on the server as the authorization boundary.
2. Load the current token or API key from app-owned secure storage in Rust.
3. Call host-callable Rust header update logic with the full replacement header set before starting protected sync.
4. Let JS create the sync client and control polling without receiving raw token material.
5. On native token refresh, call the Rust header update logic again.
6. On logout, stop polling and clear headers through the same Rust path.

Rollback:

- Consumers can stop calling runtime header updates if routes remain unauthenticated.
- If a runtime issue appears, reverting to a custom transport remains possible for advanced consumers, but the default path should not require custom commands or forked crates.

## Open Questions

- Should `Content-Type` in custom headers be rejected with an error or silently ignored? Rejecting is more diagnosable; ignoring is more forgiving.
- Should the JS method return `Promise<void>` or `Promise<unknown>`? The existing client methods mostly return `Promise<unknown>` for command results, but the public API can type this command as `Promise<void>` if the command returns unit.
- Should builder static headers be required in the first implementation or allowed as a follow-up? Runtime `setHeaders` and Rust host-callable updates are the core requirements for session credentials.
- Should docs include a dedicated "Authenticated Sync" page, or integrate examples into existing JS client and production pages only?
