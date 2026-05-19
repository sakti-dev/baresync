## Why

Private consumer apps need a clear, stable path for adopting Baresync without depending on public fixture internals or exposing private app code. After the public fixture E2E change proves the happy path, this change hardens the integration contract so apps can migrate smoothly and diagnose issues consistently.

## What Changes

- Add a consumer integration guide and checklist that covers Rust plugin registration, JS client setup, Drizzle proxy setup, embedded migrations, generated artifacts, DB path strategy, command names, and verification order.
- Add preflight/diagnostic helpers or documented checks that validate common integration mistakes before a device smoke run.
- Clarify how private apps should map auth/session/scope concepts into Baresync without copying fixture-only shortcuts.
- Define failure artifact conventions for logs, DB snapshots/state dumps, command payload evidence, and safe redaction.
- Add examples or tests for configurable integration seams where needed, such as custom `invoke`, command name mapping, migration status reads, and DB info reads.
- Keep Sakti POS out of public source and documentation except as a private downstream validation target owned outside this repo.

## Capabilities

### New Capabilities

- `consumer-integration-hardening`: Covers private-app integration guidance, compatibility/preflight checks, failure artifact conventions, and migration readiness criteria.

### Modified Capabilities

- `js-sync-client`: Makes the JS client integration contract explicit for private apps, including command argument shape, custom invocation, and consumer-side error propagation expectations.
- `tauri-plugin-builder`: Makes plugin registration/configuration expectations explicit for consumer apps, including API URL, encoding, DB path, migrations, limits, and contract table metadata.
- `local-db-runtime`: Makes local DB integration expectations explicit for consumers using Drizzle proxy, migration status, DB info, and SQLite path/lifecycle checks.

## Impact

- New documentation under `docs/knowledge/` and possibly package-level README sections.
- Possible small API additions for integration diagnostics or preflight checks.
- Possible additional tests for JS client config, Drizzle proxy config, plugin builder config, and migration/DB info integration checks.
- No public fixture E2E dependency on private apps.
- No Sakti POS source changes.
- No production sync protocol semantic changes.
