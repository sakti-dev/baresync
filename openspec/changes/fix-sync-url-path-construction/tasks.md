## 1. Rust Transport Layer

- [ ] 1.1 Change `crates/baresync-core/src/http.rs:27` from `{api_url}/sync/push` to `{api_url}/push`
- [ ] 1.2 Change `crates/baresync-core/src/http.rs:57` from `{api_url}/sync/status` to `{api_url}/status`
- [ ] 1.3 Change `crates/baresync-core/src/http.rs:87` from `{api_url}/sync/pull` to `{api_url}/pull`

## 2. E2E Fixture Backend

- [ ] 2.1 Change `tests/e2e/backend/fixture-server.ts:657` route key from `"POST /sync/status"` to `"POST /status"`
- [ ] 2.2 Change `tests/e2e/backend/fixture-server.ts:658` route key from `"POST /sync/pull"` to `"POST /pull"`
- [ ] 2.3 Change `tests/e2e/backend/fixture-server.ts:659` route key from `"GET /sync/pull"` to `"GET /pull"`
- [ ] 2.4 Change `tests/e2e/backend/fixture-server.ts:660` route key from `"POST /sync/push"` to `"POST /push"`

## 3. Example Apps & Scaffold Templates

- [ ] 3.1 Change `examples/inventory-json-polling/apps/app/src-tauri/src/lib.rs:63` `api_base_url` from `"http://127.0.0.1:3001/api/v1"` to `"http://127.0.0.1:3001/api/sync/v1"`
- [ ] 3.2 Change `examples/inventory-json-polling/apps/server/src/index.ts:8` route mount from `/api/v1/sync` to `/api/sync/v1`
- [ ] 3.3 Change `packages/create-baresync/src/templates/app/src/lib.rs:10` `api_base_url` from `"http://127.0.0.1:3001"` to `"http://127.0.0.1:3001/api/sync/v1"`
- [ ] 3.4 Change `packages/create-baresync/src/templates/server/src/index-hono.ts:7` route mount from `/api/v1/sync` to `/api/sync/v1`
- [ ] 3.5 Change `packages/create-baresync/src/templates/server/src/v1/routes-elysia.ts:58` prefix from `/api/v1/sync` to `/api/sync/v1`
- [ ] 3.6 Update `packages/create-baresync/src/__test__/integration-templates.test.ts:25` expected string from `/api/v1/sync` to `/api/sync/v1`
- [ ] 3.7 Update `packages/create-baresync/src/templates/server/fallback-instructions.md:7` mount path from `/api/v1/sync` to `/api/sync/v1`

## 4. Skills Reference (source)

- [ ] 4.1 Update `skills/baresync/reference/query.md:24` — remove `/sync/` from path references
- [ ] 4.2 Update `skills/baresync/reference/server.md:161,188` — remove `/sync/` from path references
- [ ] 4.3 Update `skills/baresync/reference/debug.md:93` — remove `/sync/` from path reference
- [ ] 4.4 Update `skills/baresync/reference/internals.md:12` — remove `/sync/` from path reference
- [ ] 4.5 Update `skills/baresync/reference/testing.md:177` — remove `/sync/` from path reference

## 5. Documentation

- [ ] 5.1 Update `apps/docs/content/docs/server/overview.mdx` — route table, diagram, and factory table (~10 references)
- [ ] 5.2 Update `apps/docs/content/docs/server/status-handler.mdx:73,83` — remove `/sync/` from path references
- [ ] 5.3 Update `apps/docs/content/docs/server/pull-handler.mdx:89,103` — remove `/sync/` from path references
- [ ] 5.4 Update `apps/docs/content/docs/server/push-handler.mdx:86` — remove `/sync/` from path reference
- [ ] 5.5 Update `apps/docs/content/docs/server/errors.mdx:90` — remove `/sync/` from path reference
- [ ] 5.6 Update `apps/docs/content/docs/reference/rust-api.mdx:434-436` — remove `/sync/` from endpoint list
- [ ] 5.7 Update `apps/docs/content/docs/getting-started/understanding-your-project.mdx:145-146` — remove `/sync/` from path references
- [ ] 5.8 Update `apps/docs/content/docs/getting-started/troubleshooting-first-run.mdx:76` — remove `/sync/` from path reference
- [ ] 5.9 Update `apps/docs/content/docs/sync-engine/status-flow.mdx:13` — remove `/sync/` from path reference
- [ ] 5.10 Update `apps/docs/content/docs/sync-engine/push-flow.mdx:16` — remove `/sync/` from path reference
- [ ] 5.11 Update `apps/docs/content/docs/sync-engine/pull-flow.mdx:13` — remove `/sync/` from path reference
- [ ] 5.12 Update `apps/docs/content/docs/concepts.mdx:25-26` — remove `/sync/` from path references
- [ ] 5.13 Update `apps/docs/content/docs/testing/e2e-runbook.mdx:77-79,95-98` — remove `/sync/` from path references
- [ ] 5.14 Update `apps/docs/content/docs/testing/server-contract-tests.mdx:12-14,52` — remove `/sync/` from path references

## 6. OpenSpec

- [ ] 6.1 Update `openspec/specs/sync-pull-client/spec.md:9,83` — remove `/sync/` from path references
- [ ] 6.2 Update `openspec/specs/sync-push-client/spec.md:15` — remove `/sync/` from path reference
- [ ] 6.3 Update `openspec/specs/inventory-example/spec.md:293,303` — remove `/sync/` from path references
- [ ] 6.4 Update `openspec/server-handler-helpers.md:97,103,109,121,125,129` — remove `/sync/` from path references
- [ ] 6.5 Update `openspec/knowledge/E2E-TESTING-RUNBOOK.md:69-71` — remove `/sync/` from path references
