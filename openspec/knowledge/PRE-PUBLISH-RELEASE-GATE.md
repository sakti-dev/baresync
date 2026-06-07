# Pre-Publish Release Gate

Use this gate before bumping versions, tagging, or pushing any change that touches public Baresync behavior.

This repository has three distinct verification layers:

1. Library checks
2. Example app validation
3. Smoke tests against a real consumer surface

Do not publish if only the library layer passes.

## What Must Be Proven

### 1. Library checks

Run these first:

```sh
bun x ultracite check
bun run typecheck
cargo test -p baresync-core
cargo test -p tauri-plugin-baresync
bun test packages/baresync/src/tauri/__test__/client.test.ts
```

These checks prove Rust and JS code correctness, but they do not prove the app can consume the permission bundle or start with the default capability.

### 2. Example app validation

Use `examples/inventory-json-polling` as the public consumer reference.

Run:

```sh
bun run --cwd examples/inventory-json-polling check
bun run --cwd examples/inventory-json-polling build
```

Then verify the example app wiring for the change under test.

For auth/header work, the example must prove:

- login can complete
- `syncClient.setHeaders(...)` runs before polling
- token refresh updates headers again
- logout clears headers
- the server receives the header on real sync requests

If the change touches plugin permissions or commands, the example build must start cleanly with the published capability set, not a hand-edited workaround.

### 3. Smoke tests

Use the repository smoke suite to catch real consumer failures.

Run the fixture backend contract checks first:

```sh
bun --cwd tests/e2e run fixture:backend:contract:json
```

Then run the public desktop smoke:

```sh
bun --cwd tests/e2e run desktop:sync:json
```

If the change affects Android, also run:

```sh
bun --cwd tests/e2e run android:sync:json
```

Smoke tests exist to catch:

- Tauri permission manifest mistakes
- plugin registration failures
- IPC command name mismatches
- example-app integration mistakes
- backend request/response regressions
- local SQLite path and restart issues

## Order Of Operations

Use this order:

1. Fix code
2. Run library checks
3. Run `examples/inventory-json-polling` build/check
4. Run fixture backend contract checks
5. Run desktop smoke
6. Run Android smoke when relevant
7. Bump versions
8. Commit
9. Tag
10. Push

Do not bump versions before the example app and smoke tests pass.

## What This Gate Catches

This gate is required for changes to:

- Tauri commands
- default permissions
- generated permissions
- JS client public API
- auth/header propagation
- plugin builder defaults
- scaffold/templates that generate consumer code

These are the failure modes that unit tests miss:

- permission identifier format mistakes
- missing default capability entries
- commands present in Rust but not allowed in the consuming app
- generated consumer code that points at a dead path
- example-app startup regressions
- smoke-only runtime wiring failures

## Minimum Release Rule

If the repo has not been validated in the example app and at least one smoke path, do not publish.

If the change affects auth or permissions, the minimum acceptable proof is:

- example app build succeeds
- desktop smoke succeeds
- the default capability includes the new command

