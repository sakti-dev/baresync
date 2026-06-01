## Context

The Tauri plugin builder (`crates/tauri-plugin-baresync/src/builder.rs`) currently exposes `.max_push_bytes()` and `.max_push_rows()` methods that map to `SyncEngineConfig` fields. The builder's `build()` method defaults `max_push_bytes` to 256KB, which overrides the core engine's hard ceiling default of 2MB. Since `target_push_bytes` also defaults to 256KB (from `SyncEngineConfig::default()`), the two-level chunking collapses — both the initial chunking target and the hard ceiling are 256KB.

Research into serverless platform limits confirmed that 256KB is safe for every platform (Vercel 4.5MB, Cloudflare 100MB, AWS Lambda 6MB, Netlify 6MB). The client already has a 413 split-retry mechanism that handles server rejections adaptively. The server already owns the actual constraints via `validatePushEnvelope()` with configurable `maxBytes`/`maxRows`.

The docs have several inaccuracies: `errors.mdx` documents `SyncError::Encoding` instead of `JsonParse`, `configuration.mdx` has wrong types and missing options, `performance.mdx` doesn't accurately describe the two-level chunking.

## Goals / Non-Goals

**Goals:**
- Remove `.max_push_bytes()`, `.max_push_rows()`, `.transport()`, and `.db_name()` from the Tauri plugin builder
- Let core engine defaults (256KB target, 2MB ceiling, 2000 rows) apply without builder override
- Fix all doc inaccuracies found during the audit
- Update `tauri-plugin-builder` spec to reflect the smaller builder API

**Non-Goals:**
- Changing the core engine's chunking logic (it's correct)
- Changing the server handler's `maxBytes`/`maxRows` options (they stay)
- Adding `PushLimits` presets or provider-specific configs
- Changing the 413 split-retry behavior

## Decisions

### 1. Remove builder methods instead of fixing the default mapping

**Decision**: Remove `.max_push_bytes()` and `.max_push_rows()` from the builder entirely, rather than fixing the default to 2MB.

**Rationale**: Research proved 256KB target + 2MB ceiling is safe for all platforms. Exposing these knobs invites misconfiguration without solving a real problem. The server owns the actual constraints. The client adapts via 413. Less API surface is better.

**Alternative considered**: Fix the builder to map `.max_push_bytes()` to `target_push_bytes` and keep `max_push_bytes` at 2MB. Rejected because it adds API surface for no practical benefit.

### 2. Keep `PluginConfig` fields for now

**Decision**: Keep `max_push_bytes` and `max_push_rows` in `PluginConfig` struct but use core engine defaults in `build()` instead of builder overrides.

**Rationale**: `PluginConfig` is used internally and in tests. Removing fields from it would break internal code. The builder methods are the public API — removing those is the breaking change that matters.

**Alternative considered**: Remove fields from `PluginConfig` too. Rejected as unnecessary churn — the internal struct doesn't face users.

### 3. Remove `.transport()` from the builder

**Decision**: Remove the `.transport()` method from the public builder API.

**Rationale**: JSON is the only supported encoding. A custom transport is unnecessary API surface for production apps. Tests that need mocking can use the core engine directly. When MessagePack or other encodings are natively supported in the future, `.transport()` or `.encoding()` can be re-added as a non-breaking addition.

**Alternative considered**: Keep `.transport()` for future extensibility. Rejected because YAGNI — dead API surface for 2 years is worse than removing it now and adding it back when needed.

### 4. Remove `.db_name()` from the builder

**Decision**: Remove the `.db_name()` method from the public builder API.

**Rationale**: Having two ways to specify the database path (`.db_path()` and `.db_name()`) adds confusion. `.db_path()` is explicit and clear. Users who want app-data-relative resolution can resolve the path themselves before calling `.db_path()`.

**Alternative considered**: Keep both for convenience. Rejected because the convenience is minimal and the confusion cost is real.

### 5. Fix docs incrementally, not rewrite

**Decision**: Fix specific inaccuracies in existing doc pages rather than rewriting them.

**Rationale**: The docs are well-structured. The issues are specific: wrong variant name, wrong types, missing options, inaccurate chunking description. Targeted fixes are safer and reviewable.

## Risks / Trade-offs

- **Breaking change for existing apps** → Apps calling `.max_push_bytes()`, `.max_push_rows()`, `.transport()`, or `.db_name()` will get compile errors. Migration: delete the calls and rely on defaults. The behavior is unchanged because the defaults were always the intended values.
- **Users who genuinely need different limits** → They can still configure the server handler's `maxBytes`/`maxRows`. The client-side limits were never the right place for this.
- **Future need for client-side tuning** → If a platform-specific optimization is needed later, the methods can be re-added. Removing now is the conservative choice.
- **Future need for custom encoding** → When MessagePack or other encodings are natively supported, `.transport()` or `.encoding()` can be re-added as a non-breaking addition.
