## Context

Baresync already exposes low-level server primitives for decoding, encoding, push validation, idempotency, ordering, and error mapping. Those primitives are flexible but leave consumers to repeat the same route flow in every server framework. The next layer should make the common path easy without hiding app-owned authorization, tenancy, conflict handling, or database writes.

This change depends on `add-status-server-primitives` because the handler layer should expose push, status, and pull together. Status remains a server protocol endpoint that lets the runtime cheaply determine whether pull work is needed and which tables changed.

## Goals / Non-Goals

**Goals:**
- Provide framework-neutral handler factories that accept Web `Request` objects and return Web `Response` objects.
- Compose existing server primitives rather than duplicating protocol logic.
- Keep authorization and scope resolution explicit through an app-provided `resolveScope` callback.
- Keep app-specific table reads and writes explicit through `applyPushChanges`, `loadSyncStatus`, and `loadPullChanges`.
- Support JSON and protobuf with a typed encoding configuration.
- Provide examples for Hono and Elysia as adapter patterns, without depending on either framework.

**Non-Goals:**
- Do not generate framework-specific routers.
- Do not infer auth, sessions, tenants, outlets, merchants, or permissions.
- Do not implement app database write/read semantics.
- Do not add a JS sync orchestration API.
- Do not change Tauri plugin or Rust runtime behavior.

## Decisions

### Use Web Request and Response as the handler boundary

The handler factories SHALL return functions that accept `(request, context)` and return `Promise<Response>`. The context type is generic and consumer-owned.

```ts
const response = await pushHandler(request, { session });
```

This keeps the API portable across Hono, Elysia, Workers, Bun, and route-handler style frameworks.

**Alternatives considered:** Add `createHonoSyncRoutes` or `createElysiaSyncRoutes`. Rejected because framework adapters can be one-line wrappers, and framework dependencies would make the public server package less portable.

### Keep authorization in `resolveScope`

The handler SHALL decode the request first, then call `resolveScope({ scopeId, context, request })`. The app returns either an authorized scope value or a response description with a status and body.

This is the narrow point where the protocol-provided `scopeId` meets app-specific session and permission rules.

**Alternatives considered:** Pass raw session data into table callbacks and let each callback authorize independently. Rejected because it spreads auth decisions across unrelated operations and makes it easier to forget an access check.

### Let callbacks return canonical sync bodies

`applyPushChanges`, `loadSyncStatus`, and `loadPullChanges` SHALL return canonical response bodies that `encodeSyncResponse` can encode directly. Baresync should not infer how domain rows map to cloud tables.

**Alternatives considered:** Have callbacks return domain rows and let Baresync build sync responses. Rejected because that becomes a schema-specific server implementation and conflicts with the low-level primitive design.

### Make idempotency explicit in push handler config

Push idempotency SHALL be configured under `idempotency: { db }`. The push handler then uses `createIdempotencyGuard` internally. This keeps the common path safe while making the storage dependency visible.

**Alternatives considered:** Use a top-level `db` option. Rejected because it is less clear that the DB is for idempotency storage, not app business writes.

### Do not add client orchestration here

The handler layer prepares the server side for a future status-aware runtime, but it does not add `getStatus()`, `smartSyncNow()`, or any new JS client workflow. The later runtime alignment should improve the existing `syncNow()` behavior internally.

**Alternatives considered:** Add a JS status client helper with this change. Rejected because it would encourage app-level orchestration that Baresync should eventually own inside the runtime.

## Risks / Trade-offs

- [Risk] Handler helpers become too opinionated. [Mitigation] Keep app-owned callbacks responsible for scope, writes, reads, and response body construction.
- [Risk] Framework examples are mistaken for framework-specific support. [Mitigation] Document them as small adapters over Web `Request` and `Response`, not exported router factories.
- [Risk] Status helper lands before runtime consumes it. [Mitigation] Treat this as server-side readiness for the later runtime alignment change.
- [Risk] Callback types become too loose. [Mitigation] Define explicit input and result shapes for each callback, while keeping row values `unknown` or `Record<string, unknown>` where app schema differs.
