# Consumer Integration Hardening

This guide is the public checklist for wiring Baresync into a consumer Tauri app. It must stay independent of private downstream apps and must not require anything under `openspec/external/sakti-pos`.

Use it after generated artifacts compile locally and before investing time in desktop or Android device automation. The goal is to catch command, database, migration, and contract mismatches while the failure is still cheap to inspect.

## Integration Order

1. Generate sync artifacts from the consumer app's public Baresync contract and commit the generated manifest/artifacts with the app code that uses them.
2. Register the Rust plugin with explicit configuration: API URL, encoding, push limits, database path, sync contract table metadata, and embedded migrations.
3. Run embedded migrations against the same SQLite path that the plugin will use at runtime.
4. Wire the JS sync client with `createSyncClient`, a stable `scopeId`, and the app's chosen Tauri `invoke` function.
5. Wire local reads and writes through `createTauriDrizzleDatabase` using the same `invoke` path and command names as the plugin registration.
6. Run read-only preflight checks on desktop: command invocation, DB info, migration status, Drizzle proxy read, local sync state, and sync contract metadata.
7. Run host tests first, then the public fixture smoke, then private desktop or Android smoke outside this repository.

Do not start with device smoke. Device failures are expensive to debug if host tests, plugin registration, migration status, and proxy reads have not already been proven.

## Rust Plugin Registration

Consumer apps own plugin configuration. Prefer explicit values over builder defaults so desktop, Android, and CI use the same contract.

```rust
use tauri_plugin_baresync::builder::Builder as BaresyncBuilder;

tauri::Builder::default()
    .plugin(
        BaresyncBuilder::new()
            .api_base_url(sync_api_url)
            .encoding("json")
            .max_push_bytes(2 * 1024 * 1024)
            .max_push_rows(2000)
            .db_path(app_sqlite_path)
            .contract_tables(sync_contract_tables)
            .migrations(embedded_migrations)
            .build(),
    );
```

Required inputs:

- `api_base_url`: The server sync endpoint root used by push and pull commands.
- `encoding`: Use `json` unless a future version documents another supported encoding for the full stack.
- `max_push_bytes`: The maximum encoded payload size for a push chunk.
- `max_push_rows`: The maximum row count for a push chunk.
- `db_path`: A stable app-owned SQLite path. Desktop restart should keep it; Android app data reset or uninstall should remove it.
- `contract_tables`: The generated table order and local-only metadata used by push, pull, and cleanup.
- `migrations`: Embedded Drizzle/SQLite migrations that create app tables plus Baresync runtime tables.

The builder pattern must not import private app modules, fixture app modules, or app-specific command handlers. App-specific code may produce the values, but Baresync should only receive public configuration.

## JS Sync Client

Use `createSyncClient` from `@repo/baresync/tauri` or the package root. The client sends stable command names and a single argument object containing `scopeId`.

```ts
import { createSyncClient } from "@repo/baresync/tauri";
import { invoke } from "@tauri-apps/api/core";

export const syncClient = createSyncClient({
  apiUrl: "https://sync.example.test",
  encoding: "json",
  scopeId: currentWorkspaceId,
  invoke,
});
```

Command contract:

- `syncNow()` invokes `sync_now` with `{ scopeId }`.
- `push()` invokes `sync_push` with `{ scopeId }`.
- `pull()` invokes `sync_pull` with `{ scopeId }`.
- `fullResync()` invokes `sync_full_resync` with `{ scopeId }`.
- `getState()` invokes `get_sync_local_state` with `{ scopeId }`.

Provide a custom `invoke` when a consumer app needs logging, tracing, retry classification, shell integration, or test instrumentation. The JS client intentionally does not own UI state, toast copy, retry policy, login refresh, or auth expiry handling. Command rejections propagate to the caller so the consumer app can classify and display the failure using its own policy.

## Local DB And Drizzle Proxy

Use `createTauriDrizzleDatabase` for app Drizzle access through the Tauri plugin. The helper maps Drizzle proxy calls to the local trusted app bridge, not a remote SQL API.

```ts
import { createTauriDrizzleDatabase } from "@repo/baresync/db";
import { invoke } from "@tauri-apps/api/core";
import * as schema from "./schema";

export const db = createTauriDrizzleDatabase({
  schema,
  invoke,
  commands: {
    runSql: "run_sql",
    runSqlBatch: "run_sql_batch",
  },
});
```

Validation checks:

- Call `run_migrations` before normal app reads and writes.
- Call `get_migration_status` and confirm the expected migration hashes are present.
- Call `get_db_info` and confirm the path is the intended app-owned SQLite file.
- Run a basic Drizzle proxy read through the configured `invoke`, such as selecting one row from a known table.
- Call `get_sync_local_state` with the app's `scopeId` and confirm the returned dirty count and baseline flag make sense for the test state.

DB path policy:

- Desktop restart should keep the same DB file unless the test explicitly resets it.
- Android app data reset and uninstall/reinstall should clear the DB file.
- Fixture smoke may use deterministic temp paths, but private apps should use their normal app data path.
- A DB snapshot is safe by default only for public fixture data. Private app snapshots require redaction or explicit opt-in.

## Compatibility Checklist

Run this checklist before desktop or Android smoke:

- Command names match the public contract: `sync_now`, `sync_push`, `sync_pull`, `sync_full_resync`, `get_sync_local_state`, `run_sql`, `run_sql_batch`, `run_migrations`, `get_migration_status`, and `get_db_info`.
- Every sync call receives the intended stable `scopeId`.
- The API URL points at the expected environment for the build profile.
- Encoding is supported end to end.
- Push byte and row limits match the generated contract and server expectation.
- Contract table upsert/delete order matches generated artifacts.
- Local-only columns metadata is present for app-only state columns.
- Generated artifacts are fresh relative to the schema and server contract.
- Embedded migrations are the same migrations used by the local app DB schema.
- The SQLite path is stable and belongs to the app profile under test.
- Drizzle proxy commands use the same command names and `invoke` path as runtime.
- Migration status and DB info commands are callable.
- Local sync state is readable for the current scope.
- Failure artifact collection is configured with redaction before private device runs.

## Read-Only Preflight

Preflight should identify actionable mismatches and avoid mutating app state beyond safe read-only checks. Running migrations is acceptable only when the app normally does it during startup; otherwise run it in an explicit setup step.

Suggested desktop preflight sequence:

1. Invoke `get_db_info` and verify the path and file size are plausible.
2. Invoke `get_migration_status` and compare hashes with the embedded migration list.
3. Invoke `get_sync_local_state` with the test `scopeId`.
4. Perform a Drizzle proxy read through `createTauriDrizzleDatabase`.
5. Inspect generated contract metadata for table order, local-only columns, encoding, and limits.
6. Print mismatches as field-level messages, for example `encoding expected json but plugin returned protobuf` or `contract table order missing products`.

Do not let preflight silently repair configuration. It should fail early with the exact seam that is wrong: command unavailable, wrong DB path, missing migration, unsupported encoding, missing limit, missing local-only metadata, missing table order, or proxy query failure.

## Auth And Scope Boundaries

Authentication, session storage, token refresh, and permission state belong to the consumer app. Baresync only needs public sync inputs: configured API URL, command invocation, local DB access, and stable scope mapping.

Scope mapping is also a consumer responsibility. The app must choose a stable `scopeId` compatible with its generated contract and server routes. Common app concepts include merchant, outlet, tenant, workspace, organization, or user-owned sandbox. Baresync does not define which one is correct for the product.

Test-only auth injection may be useful for fixture and private smoke automation, but it is not a required Baresync auth model.

## Failure Artifacts

Public fixture runs may collect full logs, fixture DB snapshots, fixture command payloads, WebDriver output, Maestro output, environment summaries, and generated manifest evidence because the data is synthetic.

Private app runs require redaction by default:

- Exclude or redact tokens, refresh tokens, session IDs, cookies, API keys, and secrets.
- Exclude raw customer rows unless the test fixture is synthetic and approved for capture.
- Redact command payload samples down to command name, method, redacted query shape, scope category, and row counts.
- Treat DB snapshots as opt-in artifacts with explicit handling for customer data.

Useful DB failure evidence:

- DB path and whether the file exists.
- DB file size.
- Migration records and expected migration hashes.
- SQLite error string.
- Command name and SQL method.
- Redacted query shape, table name, parameter count, and result row count.

Useful device failure evidence:

- Desktop app logs.
- WebDriver output.
- Android logcat around the failed action.
- App id and build profile.
- Reset method used before the run.
- Generated manifest version or hash.
- The preflight checklist result.

## Independence Rule

This public guidance must stay valid for any consumer app. It must not require private source paths, private routes, private auth implementation, private schema names, or app-specific commands. Private downstream apps can use this guide as a checklist, but their code and validation remain outside this repository.
