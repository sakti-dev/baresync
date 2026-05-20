## 1. Preconditions

- [x] 1.1 Apply and complete `add-status-server-primitives` before implementing handler factories.
- [x] 1.2 Confirm `decodeSyncRequest` and `encodeSyncResponse` support `kind: "push" | "status" | "pull"` for JSON and protobuf.

## 2. Handler API and Types

- [x] 2.1 Add server handler option types for JSON and protobuf encoding configurations.
- [x] 2.2 Add shared callback types for `resolveScope`, `applyPushChanges`, `loadSyncStatus`, and `loadPullChanges`.
- [x] 2.3 Define framework-neutral handler signatures that accept `(request: Request, context: TContext)` and return `Promise<Response>`.
- [x] 2.4 Export the handler factories from the server package entry point.

## 3. Push Handler

- [x] 3.1 Add tests for successful authorized push handling.
- [x] 3.2 Add tests for unauthorized push handling that does not call `applyPushChanges`.
- [x] 3.3 Add tests for idempotent push replay through `createIdempotencyGuard`.
- [x] 3.4 Implement `createSyncPushHandler` using decode, validate, scope resolution, ordering, idempotency, app callback, and encode primitives.

## 4. Status Handler

- [x] 4.1 Add tests for successful authorized status handling.
- [x] 4.2 Add tests for unauthorized status handling that does not call `loadSyncStatus`.
- [x] 4.3 Implement `createSyncStatusHandler` using decode, scope resolution, app callback, and encode primitives.

## 5. Pull Handler

- [x] 5.1 Add tests for successful authorized pull handling.
- [x] 5.2 Add tests for unauthorized pull handling that does not call `loadPullChanges`.
- [x] 5.3 Implement `createSyncPullHandler` using decode, scope resolution, app callback, and encode primitives.

## 6. Examples and Verification

- [x] 6.1 Add Hono usage example showing `c.req.raw` delegation.
- [x] 6.2 Add Elysia usage example showing `request` delegation.
- [x] 6.3 Run relevant server handler tests.
- [x] 6.4 Run `bun x ultracite check`.
- [x] 6.5 Run the package typecheck script.
- [x] 6.6 Confirm no Tauri plugin or Rust runtime behavior changed.
