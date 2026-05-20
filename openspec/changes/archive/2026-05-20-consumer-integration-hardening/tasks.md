## 1. Integration Contract Documentation

- [x] 1.1 Create consumer integration guidance under `openspec/knowledge/`.
- [x] 1.2 Document the ordered integration checklist from generated artifacts through private app device smoke validation.
- [x] 1.3 Document Rust plugin builder inputs: API URL, encoding, limits, DB path, contract table metadata, and embedded migrations.
- [x] 1.4 Document JS sync client setup, command names, command argument shape, custom `invoke`, and consumer-owned UI/error policy.
- [x] 1.5 Document Drizzle proxy setup with `createTauriDrizzleDatabase`, command mapping, migration status, DB info, and a basic read check.
- [x] 1.6 Document auth/session and scope boundaries as consumer-owned integration concerns.
- [x] 1.7 Document that public integration guidance does not depend on `openspec/external/sakti-pos` or any private consumer app.

## 2. Compatibility And Preflight

- [x] 2.1 Define a compatibility checklist for command names, scope ID mapping, API URL, encoding, limits, contract table order, generated artifacts, migrations, DB path, Drizzle proxy, migration status, DB info, local state, and failure artifacts.
- [x] 2.2 Add documented preflight steps or helper APIs for command invocation, DB info, migration status, and Drizzle proxy read validation.
- [x] 2.3 Add documented preflight steps or helper APIs for sync contract metadata validation.
- [x] 2.4 Ensure preflight output identifies actionable mismatches without mutating consumer app state beyond safe read-only checks.

## 3. JS Client Hardening

- [x] 3.1 Add or update JS client tests that assert command names and argument shape remain stable for private consumers.
- [x] 3.2 Add or update JS client tests that assert custom `invoke` can be used for app instrumentation and testability.
- [x] 3.3 Add or update JS client tests that assert command rejection preserves original error information for consumer classification.
- [x] 3.4 Update public JS client exports or docs if a preflight helper is added under the Tauri client surface.

## 4. Plugin And Local DB Hardening

- [x] 4.1 Add or update plugin builder tests or examples for explicit consumer configuration.
- [x] 4.2 Add or update local DB helper tests or examples for custom command mapping and custom `invoke`.
- [x] 4.3 Add or update migration status and DB info integration examples.
- [x] 4.4 Ensure diagnostics and examples avoid private app modules, fixture-only shortcuts, and Sakti-specific command handlers.

## 5. Failure Artifact Guidance

- [x] 5.1 Document safe artifact categories for public fixture runs and private app runs.
- [x] 5.2 Document redaction requirements for tokens, session values, raw customer rows, secrets, and command payload samples.
- [x] 5.3 Document useful DB failure evidence: DB path, file size, migration records, SQLite error, command name, SQL method, and redacted query shape.
- [x] 5.4 Document useful device failure evidence: desktop logs, WebDriver output, Android logcat, app id, build profile, reset method, and generated manifest version.

## 6. Verification

- [x] 6.1 Run OpenSpec validation for `consumer-integration-hardening`.
- [x] 6.2 Run Baresync JS tests affected by client, DB helper, or preflight changes.
- [x] 6.3 Run Rust tests affected by plugin builder or local DB examples.
- [x] 6.4 Run typecheck for affected packages.
- [x] 6.5 Review documentation for private app independence and absence of Sakti-specific requirements.
