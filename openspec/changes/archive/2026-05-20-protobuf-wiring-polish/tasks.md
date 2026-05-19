## 1. Schema and wire contract

- [x] 1.1 Allow `defineSyncContract` and `syncSchema` to accept `encoding: "protobuf"` without breaking existing JSON defaults.
- [x] 1.2 Add protobuf-aware request decoding and response encoding in the server primitives.
- [x] 1.3 Make protobuf request hashing use the raw encoded bytes used on the wire.

## 2. Generator and protobuf metadata

- [x] 2.1 Extend the generator contract output to preserve protobuf encoding metadata.
- [x] 2.2 Add protobuf field-number stability metadata to generated outputs or manifest data, including typed row field numbers and table wrapper field numbers.
- [x] 2.3 Keep JSON and protobuf generation driven from the same reflected contract and table order.
- [x] 2.4 Regenerate checked-in generated artifacts and verify they are stable.

## 3. Fixtures and parity coverage

- [x] 3.1 Update canonical fixture coverage so protobuf tests derive from the JSON fixtures.
- [x] 3.2 Add parity tests that compare normalized JSON and protobuf payloads for the same logical sync data.
- [x] 3.3 Add regression coverage for protobuf field-number reuse, encoding mismatches, and accidental JSON-string payloads inside protobuf envelopes.

## 4. Verification and cleanup

- [x] 4.1 Run the generator and drift checks for the updated contract outputs.
- [x] 4.2 Run the relevant unit and parity tests for schema, server, and generator paths.
- [x] 4.3 Update any developer-facing docs or notes that still describe protobuf as deferred.

## 5. Generator workspace and Rust runtime

- [x] 5.1 Add a protobuf generator workspace config module that declares contract source and output paths.
- [x] 5.2 Generate TypeScript protobuf runtime artifacts from the same reflected Drizzle schema and metadata.
- [x] 5.3 Generate Rust protobuf runtime artifacts from the same reflected Drizzle schema and metadata.
- [x] 5.4 Wire `baresync-core` and `tauri-plugin-baresync` to consume the generated Rust runtime artifacts.
- [x] 5.5 Replace any remaining handwritten protobuf codec paths with generated runtime imports.
- [x] 5.6 Add drift tests for the generated TypeScript and Rust protobuf runtime outputs.
