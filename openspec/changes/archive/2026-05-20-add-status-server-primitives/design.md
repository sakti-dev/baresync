## Context

Baresync server primitives currently define low-level push and pull request handling for JSON and protobuf. The generated protobuf runtime already contains status request and response support, and Sakti POS uses `/api/sync/status` before transfer commands to cheaply determine whether server changes exist and which tables should be pulled.

In Sakti POS, status is called from the app's JS orchestration layer, then the result determines whether to invoke native push, pull, full-resync, or skip. This change keeps that lesson but narrows the implementation to the JS server primitive layer. Runtime behavior, including making `sync_now` status-aware, remains a follow-up change.

## Goals / Non-Goals

**Goals:**
- Add `status` as a supported server primitive request/response kind.
- Keep JSON and protobuf as encodings of the same status request and response shape.
- Validate status requests for `scopeId` and `cursor`.
- Preserve raw request-byte hashing for status requests, matching push and pull primitive behavior.
- Add tests that prove JSON and protobuf status payloads round-trip through the public server helpers.

**Non-Goals:**
- Do not add framework-specific route helpers.
- Do not add batteries-included server handlers yet.
- Do not change `createSyncClient().syncNow()` behavior in this change.
- Do not add Rust plugin status transport or protobuf runtime transport alignment in this change.
- Do not require consumers to use `/status`; this change only makes it available as a primitive.

## Decisions

### Status belongs in server primitives first

The status endpoint is a server protocol concern: it decodes a scoped request, returns changed table metadata, and can be encoded as JSON or protobuf. Putting it in `packages/baresync/server` keeps protocol support reusable across Hono, Elysia, Workers, Bun, and future batteries-included handlers.

**Alternatives considered:** Put status directly into the Tauri plugin first. Rejected because the plugin should consume the protocol later; it should not be the source of truth for the server endpoint shape.

### Use POST body semantics for status primitives

Status requests SHALL be decoded from the request body, the same as push and pull primitives. This matches protobuf transport requirements and keeps JSON/protobuf symmetric.

**Alternatives considered:** Add query-string GET status support now. Rejected because the proven protobuf path uses POST bodies, and GET support can be added later without blocking the server helper work.

### Keep response shape small and decision-focused

The canonical status response SHALL contain `changedTables`, `hasChanges`, `cursor`, and `serverTime`. It does not return rows or tombstones; those remain pull response responsibilities.

**Alternatives considered:** Let status return a lightweight row preview. Rejected because that blurs status and pull semantics and complicates pagination.

### Preserve existing JS client API until runtime alignment

This change intentionally does not add a separate public `getStatus()` or `smartSyncNow()` client API. The later runtime alignment should make the existing `syncNow()` cheaper internally rather than requiring consumers to orchestrate status themselves.

**Alternatives considered:** Add a JS status method immediately. Rejected because it encourages app-level orchestration that we want Baresync runtime to own later.

## Risks / Trade-offs

- [Risk] Status support lands before the runtime uses it. [Mitigation] Scope this change as a protocol primitive that unblocks server handlers and later runtime alignment.
- [Risk] Consumers confuse status with pull. [Mitigation] Specs and tests define status as metadata-only: changed table names, boolean, cursor, and server time.
- [Risk] Request validation diverges between JSON and protobuf. [Mitigation] Both encodings pass through `decodeSyncRequest` and share required-field checks for `kind: "status"`.
