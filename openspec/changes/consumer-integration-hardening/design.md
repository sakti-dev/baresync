## Context

Baresync now has core sync behavior, plugin commands, JS client helpers, local DB helpers, and a proposed public fixture E2E target. Private consumers still need a safe migration path from app-specific sync code to the public plugin surface. The hard part is not only code wiring; it is avoiding subtle integration failures around command names, scope IDs, plugin config, embedded migrations, generated artifacts, DB path ownership, auth/session handling, and device failure diagnosis.

This change treats private apps as downstream consumers. Public code and docs must not depend on Sakti POS, but they should be strong enough that Sakti and similar apps can integrate by following the same public contract.

## Goals / Non-Goals

**Goals:**

- Define a consumer integration guide and compatibility checklist.
- Add or document preflight checks for the integration seams most likely to fail.
- Make command argument shape, plugin builder config, DB path behavior, migration status, DB info, and generated artifact expectations explicit.
- Establish failure artifact conventions for desktop and Android device smoke runs.
- Keep private app integration smooth without exposing private app code.

**Non-Goals:**

- Do not migrate Sakti POS in this repo.
- Do not make public docs reference private routes, schema, auth flows, or app names as requirements.
- Do not create a second E2E fixture; the public fixture device E2E change owns the runnable app target.
- Do not change sync protocol semantics.
- Do not make device automation required in normal CI.

## Decisions

### Document the integration contract as a checklist plus preflight checks

Consumers need an ordered path: generate artifacts, register the plugin, configure local DB, wire JS client, wire Drizzle proxy, run migrations, verify DB info, verify local state, then run device smoke. A checklist is easier to apply to private apps than prose alone.

Alternative considered: rely on the fixture app as the only documentation. That proves one integration but does not help private apps diagnose mismatches in their own config.

### Keep auth/session app-owned

Baresync should not prescribe private app auth. The guide should explain that apps own login/session/token acquisition and pass only the public sync inputs required by Baresync surfaces. Fixture test auth injection can be documented as a pattern, not a required auth model.

Alternative considered: add a built-in auth test hook to Baresync. That would mix app concerns into the sync plugin and is rejected.

### Prefer explicit preflight over hidden magic

Preflight checks should validate observable integration state: command availability, migration status, DB info, contract table metadata, configured encoding, configured limits, and Drizzle proxy query success. They should not silently repair consumer setup.

Alternative considered: have runtime calls infer or mutate missing config automatically. That creates surprising device behavior and weakens diagnostics.

### Use safe failure artifacts by default

The integration guide should define artifact types and redaction rules. Logs and DB snapshots are useful, but private apps may contain secrets or customer data, so artifact collection must be explicit and safe.

Alternative considered: always collect full DB snapshots. That is acceptable for the public fixture but not safe as a default private app practice.

## Risks / Trade-offs

- Preflight checks become stale -> Keep them tied to public command surfaces and add tests where they inspect generated config or mocked invoke behavior.
- Docs overfit the fixture app -> Include private app integration language and avoid fixture-only assumptions.
- Scope creep into app migration -> Keep Sakti migration out of this change; document the contract private apps can follow.
- Artifact guidance leaks sensitive data -> Require redaction and make DB snapshots opt-in for private apps.
- Command/config drift -> Add tests that assert command names, argument shape, and helper defaults where practical.

## Migration Plan

This change is additive. Consumers can continue using existing Baresync APIs while adopting the checklist and preflight checks incrementally.

Recommended downstream sequence:

1. Run generator and commit generated artifacts.
2. Register the plugin with explicit API URL, encoding, DB path, limits, contract tables, and migrations.
3. Replace app-local Drizzle proxy setup with `createTauriDrizzleDatabase`.
4. Replace direct sync command invocation with `createSyncClient` or equivalent public command names.
5. Run preflight checks on desktop.
6. Run public fixture smoke for baseline confidence.
7. Run private app device smoke outside this repo.

Rollback is documentation/API additive: remove preflight usage from the private app and return to existing direct calls if needed.

## Open Questions

- Whether preflight helpers should live under `baresync/tauri`, `baresync/db`, or a new `baresync/integration` export.
- Whether Rust-side plugin config introspection should be exposed as a command or documented through existing `get_db_info`, `get_migration_status`, and sync state commands.
- Whether package README updates should be part of this change or deferred to the broader public documentation phase.
