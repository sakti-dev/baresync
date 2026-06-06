## Why

The Tauri plugin's HTTP transport hardcodes `/sync/` prefix in endpoint paths (`/sync/push`, `/sync/status`, `/sync/pull`). When users set `api_base_url` to a path that already includes `/sync/` (e.g., `http://192.168.1.2:3001/api/sync/v1`), the resulting URL has a duplicate segment: `/api/sync/v1/sync/status` instead of `/api/sync/v1/status`.

This forces users to structure their backend routes to match the plugin's hardcoded convention, rather than the plugin adapting to the user's route structure.

## What Changes

- **BREAKING**: `crates/baresync-core/src/http.rs` — Change endpoint path construction from `{api_url}/sync/push` to `{api_url}/push`, `{api_url}/sync/status` to `{api_url}/status`, `{api_url}/sync/pull` to `{api_url}/pull`
- **BREAKING**: `tests/e2e/backend/fixture-server.ts` — Update route keys from `"POST /sync/status"` to `"POST /status"`, etc.
- **BREAKING**: Example apps and scaffold templates — Standardize route mounting to `/api/sync/v1` and update `api_base_url` to match
- Update all documentation and skills references to reflect the new URL construction convention
- Update OpenSpec specs that reference the old path format

## Capabilities

### New Capabilities

- `sync-url-construction`: Defines how the client transport constructs endpoint URLs from the base URL and action names

### Modified Capabilities

- `sync-pull-client`: Update spec to reflect new URL construction (`{api_url}/pull` instead of `{api_url}/sync/pull`)
- `sync-push-client`: Update spec to reflect new URL construction (`{api_url}/push` instead of `{api_url}/sync/push`)

## Impact

- **Rust crate**: `baresync-core` transport layer — 3 format strings change
- **E2E tests**: Fixture backend route definitions — 4 route keys change
- **Example apps**: `inventory-json-polling` app — 1 `api_base_url` change
- **Scaffold templates**: `create-baresync` app template — 1 `api_base_url` change
- **Documentation**: 13 docs files with ~30 route references
- **Skills**: 5 reference files in `skills/baresync/reference/`
- **OpenSpec**: 3 spec files and 2 knowledge docs
- **Breaking for existing users**: Users with `api_base_url` set to a path without `/sync/` (e.g., `http://127.0.0.1:3001/api/v1`) will need to add `/sync/` to their base URL (e.g., `http://127.0.0.1:3001/api/v1/sync`) or restructure their backend routes
