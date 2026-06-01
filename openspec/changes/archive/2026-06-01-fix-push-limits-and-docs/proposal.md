## Why

The Tauri plugin builder exposes `.max_push_bytes()` and `.max_push_rows()` that map incorrectly to the sync engine config — the builder overrides the hard ceiling (`max_push_bytes`) to 256KB, which collapses the two-level chunking architecture (target 256KB vs hard ceiling 2MB). Additionally, research into serverless platform limits (Vercel 4.5MB, Cloudflare 100MB body / 128MB memory, D1 100 bind params, Turso ~5000 bind params) shows that the 256KB default target is already safe for every platform. Exposing these knobs on the client builder adds API surface without solving a real problem — the server owns the actual constraints and the client adapts via 413 split-retry.

## What Changes

- **Remove `.max_push_bytes()` and `.max_push_rows()` from the Tauri plugin builder** — the core engine defaults (256KB target, 2MB ceiling, 2000 rows) are safe for all platforms. The builder should not override them.
- **Remove `.transport()` from the Tauri plugin builder** — JSON is the only supported encoding. Custom transports are unnecessary API surface. Can be re-added when MessagePack or other encodings are natively supported.
- **Remove `.db_name()` from the Tauri plugin builder** — `db_path` is sufficient. Having two ways to specify the database path adds confusion. Users can resolve app-data-relative paths themselves.
- **Fix the builder to not collapse two-level chunking** — stop mapping user-facing config to `max_push_bytes` (hard ceiling). Let the core engine defaults apply.
- **Fix `errors.mdx`** — `SyncError::Encoding(String)` is wrong; the actual variant is `SyncError::JsonParse(String)`.
- **Fix `configuration.mdx`** — wrong `transport` type, wrong `migrations_path` default type, missing builder options (`db_name`, `contract_json`, `encryption_key_provider`), incomplete SQLite settings.
- **Fix `performance.mdx`** — rewrite push chunking section to accurately describe the two-level architecture and explain why 256KB is the right default.
- **Update `tauri-plugin-builder` spec** — remove `max_push_bytes`, `max_push_rows`, `transport`, and `db_name` from the builder requirement.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `tauri-plugin-builder`: Remove `.max_push_bytes()` and `.max_push_rows()` from the builder API. The sync engine config retains its internal defaults; the builder no longer exposes them.
- `adaptive-chunking`: No spec changes needed — the chunking logic itself is correct. Only the builder integration changes.

## Impact

- **Breaking**: `Builder::max_push_bytes()`, `Builder::max_push_rows()`, `Builder::transport()`, and `Builder::db_name()` methods are removed. Apps calling these methods will get a compile error. Migration: delete the calls and rely on defaults.
- **Docs**: `reference/errors.mdx`, `running-in-production/configuration.mdx`, `running-in-production/performance.mdx` all need corrections.
- **No runtime behavior change**: The core engine defaults (256KB target, 2MB ceiling, 2000 rows) were already the intended values. Removing the builder methods just stops the builder from overriding the hard ceiling to 256KB.
