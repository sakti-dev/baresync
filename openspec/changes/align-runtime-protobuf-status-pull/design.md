## Context

The current public JS client exposes `syncNow()` as the main consumer entry point, and that method delegates to the Tauri `sync_now` command. The Rust engine currently implements `sync_now` as pull first, then push, then optional reconciliation pull, then garbage collection. That works, but it always pays pull cost even when local state is clean and the server has no changes.

Sakti POS proved a more selective flow: read local state, call server status with the stored cursor, then choose skip, push-only, pull-only, full sync, or full resync. This change brings that behavior into the Baresync runtime while preserving the existing JS API.

## Goals / Non-Goals

**Goals:**
- Keep `createSyncClient().syncNow()` as the public API.
- Make Rust `sync_now` call status before transfer work.
- Skip transfer work when local state is clean and status reports no server changes.
- Use status `changedTables` to narrow pull requests.
- Align status and pull transport around POST bodies for both JSON and protobuf.
- Add protobuf-capable runtime transport for status and pull using generated runtime artifacts where available.
- Preserve push chunking, idempotency, rejected-row reconciliation, cursor advancement, and garbage collection behavior.

**Non-Goals:**
- Do not add a new JS orchestration method such as `smartSyncNow`.
- Do not move status orchestration into app code.
- Do not add framework-specific server handlers.
- Do not change push transport or chunking beyond what protobuf parity requires.
- Do not change server handler primitives in this runtime change.

## Decisions

### Keep the JS API stable

The public client method stays `syncNow()`, and it continues to call the `sync_now` Tauri command. The cheaper behavior is implemented behind the command boundary in the Rust runtime.

**Alternatives considered:** Add a new `status()` or `smartSyncNow()` method to the JS client. Rejected because it splits the obvious sync entry point and makes every app reimplement runtime decisions.

### Status drives runtime transfer decisions

The runtime SHALL gather local state and server status before deciding the transfer mode:

```text
baseline needed        -> full resync, scoped by changedTables when useful
no local/server change -> skip transfer work
local only             -> push
server only            -> pull changedTables
local + server         -> pull changedTables, then push
```

This mirrors the Sakti POS decision model while moving it into the runtime.

**Alternatives considered:** Always pull and let empty pull responses be the no-op path. Rejected because status is cheaper and can narrow pulls to changed tables.

### Use POST for runtime status and pull

Status and pull runtime requests SHALL use POST request bodies rather than GET query parameters. POST bodies are required for protobuf and keep JSON and protobuf transport symmetric.

**Alternatives considered:** Keep JSON pull as GET and use POST only for protobuf. Rejected because it creates two runtime protocols and makes server handler support harder to reason about.

### Treat protobuf as transport alignment, not a separate engine

The engine decision flow should be encoding-independent. JSON and protobuf differ only in request/response encoding and content type.

**Alternatives considered:** Add a separate protobuf engine path. Rejected because it duplicates sync semantics and increases drift risk.

### Preserve reconciliation behavior after push

If push returns server-wins rejected tables, the runtime SHALL keep the existing follow-up reconciliation pull behavior. Status is used to avoid unnecessary transfer work, not to remove conflict handling.

**Alternatives considered:** Rely on the initial status result after push. Rejected because push rejection is a separate conflict signal that may require pulling server versions regardless of prior status.

## Risks / Trade-offs

- [Risk] Changing `sync_now` orchestration can alter fixture expectations. [Mitigation] Add host simulation tests for each decision branch and keep `sync_push`, `sync_pull`, and `sync_full_resync` available as explicit commands.
- [Risk] POST pull is a protocol behavior change for existing fixture backends. [Mitigation] Gate implementation behind fixture/server updates in the same change and keep tests covering JSON and protobuf parity.
- [Risk] Protobuf transport may lag generated artifact support. [Mitigation] Require generated Rust runtime availability before enabling protobuf runtime transport.
- [Risk] Status can become stale before transfer completes. [Mitigation] Treat status as an optimization only; push idempotency, pull cursor rules, and reconciliation remain authoritative.
