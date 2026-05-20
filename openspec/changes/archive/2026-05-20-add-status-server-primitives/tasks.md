## 1. Status Primitive Tests

- [x] 1.1 Add JSON status request decode coverage in `packages/baresync/src/server/__test__`.
- [x] 1.2 Add JSON status response encode coverage.
- [x] 1.3 Add protobuf status request decode coverage using the generated protobuf runtime.
- [x] 1.4 Add protobuf status response encode coverage and verify decoded fields.
- [x] 1.5 Add missing-field coverage for status requests without `scopeId`.

## 2. Server Primitive Implementation

- [x] 2.1 Extend the public server request kind type from `"push" | "pull"` to `"push" | "pull" | "status"`.
- [x] 2.2 Update `decodeSyncRequest` to validate required status fields: `scopeId` and `cursor`.
- [x] 2.3 Update `encodeSyncResponse` typing and behavior so status responses work for JSON and protobuf.
- [x] 2.4 Ensure status request hashing uses the same raw request byte path as push and pull.

## 3. Protobuf Runtime Alignment

- [x] 3.1 Verify the generated TypeScript protobuf runtime can encode/decode status requests and responses.
- [x] 3.2 Regenerate protobuf runtime artifacts if template or generated output changes are required.
- [x] 3.3 Add or update drift/parity coverage so status support remains generated and stable.

## 4. Verification

- [x] 4.1 Run the relevant server and protobuf runtime tests.
- [x] 4.2 Run `bun x ultracite check`.
- [x] 4.3 Run the package typecheck script.
- [x] 4.4 Confirm this change does not modify Tauri plugin or Rust runtime `sync_now` behavior.
