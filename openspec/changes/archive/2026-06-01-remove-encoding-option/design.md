## Context

Baresync currently exposes a wire-format `encoding` option throughout the public API. The TypeScript client (`SyncClientConfig`), the server handler factories (`createSyncPushHandler` etc.), the generator config (`defineSyncConfig` + `SyncConfigTableOptions`), and the Rust plugin builder (`BaresyncBuilder::encoding`) all require or accept an `encoding` parameter that selects between JSON and Protobuf.

In practice the value is always `"json"` — the only thing the option does today is forward the literal to the service layer, which unconditionally parses JSON anyway. The Protobuf code path is unwritten, so the `encoding` parameter is dead config.

Removing it is a strict simplification: every public-facing signature gets one fewer field, every scaffolded `routes.ts` and `sync.config.ts` gets one fewer line, every test gets one fewer fixture field.

## Goals / Non-Goals

**Goals:**
- Remove the user-facing `encoding` field from every public API surface (TS + Rust)
- Make JSON the only wire format, with no opt-out
- Keep all existing behavior identical — no functional regressions
- Update the generated contract JSON to no longer carry an `encoding` field

**Non-Goals:**
- Implementing a Protobuf backend (the option is removed, not stubbed)
- Adding MessagePack or any other alternative format
- Optimizing the JSON path (brotli/gzip at the CDN is the recommended optimization; we do not change serialization here)
- Changing the `contract.encoding` field to a different name; it is removed entirely from the generated contract JSON

## Decisions

### Decision 1: Remove `encoding` from all user-facing configs entirely (do not just make it optional)

The `encoding` field today is already the literal type `"json"`. Making it `encoding?: "json"` would still let users pass it, still appear in IntelliSense, and still need to be removed from every scaffold and example. Removing it entirely is one rename away from where we already are, and it produces a smaller API surface.

Alternatives considered:
- Keep `encoding?: "json"` as optional with default → too much lingering surface, the option still shows up everywhere
- Rename `encoding` to `wireFormat` → same problem, just a different name

### Decision 2: Drop the internal `SyncEncoding` type — it becomes the literal `"json"` string only at the call sites that need it

The `SyncRequestKind` interface in `service.ts` still uses `encoding: "json"` as a marker. After the refactor, the `decodeSyncRequest` and `encodeSyncResponse` functions no longer take an `encoding` argument — they always do JSON. The `SyncRequestKind` interface can collapse to just `kind: "push" | "pull" | "status"`. The `SyncEncoding` type union can be removed (it was `"json" | "protobuf"` and `"json"` is not worth a named type).

Alternatives considered:
- Keep `SyncEncoding` as a one-literal type → no point; `"json"` is shorter than `SyncEncoding`
- Keep `encoding` as a private internal marker in service.ts → adds noise without value

### Decision 3: Generated contract JSON no longer carries an `encoding` field

The `sync-contract.json` file currently has `"encoding": "json"`. Since there is no longer a choice, the field is removed from the contract and from the `SyncContract` type. The `SyncContract.encoding` field is dropped, the `manifest.encoding` field is dropped, and `outputs.ts` / `manifest.ts` no longer emit it.

### Decision 4: Rust `BaresyncBuilder` drops the `.encoding()` method

The Rust builder currently stores `encoding: Option<String>` and defaults to `"json"`. After the change, there is no `encoding` field, no `encoding()` method, and the internal `PluginConfig.encoding: String` field is replaced with a constant `"json"` set in `Default::default()` and overwritten by `Builder::build()`. The setup log line drops the `encoding=...` segment.

Alternatives considered:
- Keep the field as a no-op (write-only) for one release → confusing dead config
- Hardcode in the plugin entry point → no, the config struct flows through too many call sites

### Decision 5: Doc updates are textual, not structural

The `getting-started/`, `reference/`, `generator/`, `server/`, and `js-client/` doc pages mention `encoding: "json"` in code samples. These are updated in place. We do not delete or restructure the pages — only the lines that show `encoding: "json"` change.

## Risks / Trade-offs

- **[Risk] External consumers of the public API break on upgrade** → This is a breaking change; document it in the changelog. The user is intentionally committing to this.
- **[Risk] Test files reference `encoding: "json"` in many places (24 files)** → Mitigated by mechanical sed-style replace; typecheck catches anything missed.
- **[Risk] Scaffold templates that downstream users may have copied from older versions still pass `encoding`** → Those are user code; we cannot fix them, but the change is well-typed: passing an unknown field to a TypeScript config is a compile error, and the Rust `.encoding()` method is gone so calling it is a compile error.
- **[Risk] The `protobuf-generator-runtime` empty capability remains in the spec list** → No action; it was already an empty placeholder. We do not delete it as part of this change to keep the diff focused.

## Migration Plan

There is no runtime migration — this is purely a code-level removal. The wire format does not change (it was always JSON in practice). Steps:

1. Land the TS API changes (remove `encoding` from `SyncClientConfig`, `SyncHandlerOptions`, `defineSyncConfig`)
2. Land the Rust changes (remove `.encoding()` and `PluginConfig.encoding`)
3. Land the generator changes (drop `encoding` from contract and manifest)
4. Update all tests, scaffold templates, examples, and docs
5. Verify: `bun test` passes in `packages/baresync`, `packages/create-baresync`; `cargo test` passes in `crates/`; typecheck passes in `examples/inventory-json-polling`; ultracite clean

No rollback plan needed — the change is purely subtractive. If a regression is found, revert the commit.

## Open Questions

(none — the design is settled)
