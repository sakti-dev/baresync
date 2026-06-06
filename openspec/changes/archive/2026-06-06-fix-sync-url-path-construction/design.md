## Context

The Tauri plugin's HTTP transport (`crates/baresync-core/src/http.rs`) constructs endpoint URLs by appending `/sync/push`, `/sync/status`, `/sync/pull` to the user-provided `api_base_url`. This hardcodes the `/sync/` segment into the path, forcing users to structure their backend routes to match.

Current behavior:
```
api_base_url = "http://192.168.1.2:3001/api/sync/v1"
→ POST http://192.168.1.2:3001/api/sync/v1/sync/status  (wrong)
```

Expected behavior:
```
api_base_url = "http://192.168.1.2:3001/api/sync/v1"
→ POST http://192.168.1.2:3001/api/sync/v1/status  (correct)
```

The current convention (from examples and templates) expects `api_base_url` to NOT include `/sync/`:
- `create-baresync` template: `"http://127.0.0.1:3001"` (broken — server mounts at `/api/v1/sync`)
- `inventory-json-polling` example: `"http://127.0.0.1:3001/api/v1"` (broken — server mounts at `/api/v1/sync`)

This forces a specific URL structure on users and the current templates have a mismatch between client `api_base_url` and server route mounting.

The new convention standardizes on `/api/sync/v1` as the route prefix, making the version apply to the sync routes specifically (since the contract is versioned based on snapshotted contracts).

## Goals / Non-Goals

**Goals:**
- Remove hardcoded `/sync/` prefix from endpoint path construction in `http.rs`
- Let users control the full URL path structure via `api_base_url`
- Update all documentation, skills, specs, and tests to reflect the new convention

**Non-Goals:**
- Changing the server-side route structure (server routes stay at `/sync/push`, `/sync/status`, `/sync/pull`)
- Changing the `SyncHttpTransport` trait interface
- Adding URL validation or normalization beyond `trim_end_matches('/')`

## Decisions

### Decision: Remove `/sync/` prefix from client transport paths

**Rationale**: The client transport should not assume the URL path structure. The `api_base_url` should define the complete path prefix up to the action name. This gives users full control over their route organization.

**Alternatives considered**:
1. **Add URL normalization**: Parse and merge path segments to avoid duplicates. Rejected as over-engineering — the simpler fix is to not add the prefix.
2. **Document the convention**: Keep the code as-is and document that `api_base_url` should not include `/sync/`. Rejected as it doesn't solve the user's problem.

### Decision: Update fixture backend route keys

**Rationale**: The E2E fixture backend (`tests/e2e/backend/fixture-server.ts`) uses route keys like `"POST /sync/status"` for request routing. Since the client will now send requests to `/status` instead of `/sync/status`, the fixture backend must match.

**Alternatives considered**:
1. **Add path prefix in fixture backend**: Keep routes at `/sync/status` but mount them under a prefix. Rejected as unnecessary complexity.

### Decision: Update scaffold and example `api_base_url`

**Rationale**: The `create-baresync` scaffold template and `inventory-json-polling` example both have `api_base_url` values that don't match their server's route mounting. After removing the hardcoded `/sync/` prefix from the transport, these need to include the full path prefix (`/api/sync/v1`) to match the server's mounted routes.

The new convention uses `/api/sync/v1` (not `/api/v1/sync`) because the sync contract is versioned based on snapshotted contracts — the version applies to the sync routes specifically.

**Alternatives considered**:
1. **Keep `/api/v1/sync`**: Rejected because the version should apply to the sync routes, not the API as a whole.
2. **Change server mounting**: Mount routes at root level instead of under a prefix. Rejected as versioned routes are a better convention.

## Risks / Trade-offs

- **Breaking change for existing users**: Users with `api_base_url` set to a path without `/sync/` (e.g., `"http://127.0.0.1:3001/api/v1"`) will need to add `/sync/` to their base URL (e.g., `"http://127.0.0.1:3001/api/v1/sync"`) or restructure their backend routes. → Mitigation: Document the migration clearly in changelog and release notes.
- **Documentation scope**: ~30 references across 13 docs files need updating. → Mitigation: Systematic search and replace, verified by grep.
