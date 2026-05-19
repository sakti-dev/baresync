## Context

Baresync currently exposes protobuf in types and docs, but the implementation is not fully aligned. Schema helpers now accept protobuf, the server helpers support protobuf bytes, and the remaining gap is the Sakti-style generator path that emits runtime artifacts for both TypeScript and Rust from the same reflected schema. The main goal is to make protobuf a first-class supported wire format without turning Baresync into a separate protocol stack or a hand-authored codec layer.

## Goals / Non-Goals

**Goals:**
- Allow `encoding: "protobuf"` through the public contract and runtime helpers.
- Keep JSON as the default public path.
- Use protobuf wire bytes as the idempotency hash input for protobuf requests.
- Preserve protobuf field numbers across schema evolution and regenerate artifacts deterministically.
- Encode row payloads as generated protobuf messages derived from the reflected schema, not as JSON strings inside protobuf envelopes.
- Keep canonical JSON fixtures as the source of truth and validate protobuf parity against them.
- Generate TS and Rust protobuf runtime artifacts from one config-driven generator workspace.

**Non-Goals:**
- Do not replace the current sync model with a different protocol shape.
- Do not make protobuf the default encoding.
- Do not introduce a database-agnostic or non-Tauri-specific sync layer.
- Do not hardcode protobuf schemas or field maps in server/runtime code.

## Decisions

### Treat JSON and protobuf as two encodings of one contract

The public API should keep a single sync contract with an `encoding` switch. JSON stays the default because it is easier to inspect and already matches the current public examples. Protobuf is an alternate wire encoding, not a separate protocol.

**Alternatives considered:** Split JSON and protobuf into separate APIs or package entry points. Rejected because it creates drift and makes the sync semantics harder to reason about.

### Hash protobuf requests from the encoded wire bytes

For protobuf requests, the request hash should come from the encoded protobuf payload bytes, matching the Sakti implementation we traced. That keeps idempotency semantics tied to the actual transport payload rather than to a normalized object representation.

**Alternatives considered:** Hash a normalized logical body for every encoding. Rejected because it hides transport differences and does not match the protobuf path already proven in Sakti.

### Preserve field numbers with generated metadata and drift checks

Field numbers should come from deterministic schema reflection, then be recorded so regenerations can detect renumbering or reuse. That gives us append-only evolution with explicit failures when someone accidentally breaks wire compatibility.

**Alternatives considered:** Hand-maintained field maps or runtime reflection. Rejected because they increase maintenance burden and make protobuf evolution easier to break silently.

### Generate runtime artifacts from a protobuf workspace config

The protobuf generator should be invoked from a dedicated config module that defines output destinations for the generated contract metadata, TypeScript runtime, and Rust runtime. The config-driven workspace keeps the generated protobuf runtime aligned with the Drizzle schema and makes the regeneration path explicit.

**Alternatives considered:** Keep a handwritten server codec and only generate metadata. Rejected because that path does not match the Sakti implementation and makes Rust parity harder to maintain.

### Keep JSON fixtures canonical

Canonical fixture data should remain JSON so it stays readable and easy to diff. Protobuf tests can encode/decode those fixtures and compare normalized objects or hashes where appropriate.

**Alternatives considered:** Make protobuf binaries the canonical fixture format. Rejected because it is harder to review and would make parity debugging slower.

## Risks / Trade-offs

- [Risk] Protobuf field numbers drift when schema order changes. [Mitigation] Record and diff field-number metadata during generation; fail generation on reuse or renumbering.
- [Risk] Request hashing diverges between JSON and protobuf paths. [Mitigation] Keep the hash rule explicit per encoding and test both encodings against the same logical payloads.
- [Risk] Protobuf support expands the generator surface too quickly. [Mitigation] Keep the scope to contract reflection, generated metadata, and parity checks rather than adding a second independent protocol stack.
