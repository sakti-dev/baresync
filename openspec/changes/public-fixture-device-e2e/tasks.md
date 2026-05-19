## 1. Fixture App Foundation

- [ ] 1.1 Choose and create the public fixture app workspace path.
- [ ] 1.2 Add a minimal Tauri app shell with build/dev scripts and workspace wiring.
- [ ] 1.3 Register `tauri-plugin-baresync` in the fixture app with fixture DB path, JSON encoding, contract table order, and embedded migrations.
- [ ] 1.4 Add fixture schema, migrations, and sync contract metadata for a small deterministic category/product-style model.
- [ ] 1.5 Wire the fixture frontend through `packages/baresync` JS APIs, `createSyncClient`, and `createTauriDrizzleDatabase`.

## 2. Fixture UI And State Controls

- [ ] 2.1 Add stable fixture UI controls or durable test identifiers for app readiness, DB status, migration status, baseline sync, local row creation, manual sync, and persisted row display.
- [ ] 2.2 Add fixture-side state reset behavior suitable for smoke runs without depending on previous test order.
- [ ] 2.3 Add restart-safe local persistence checks through SQLite-backed fixture data.
- [ ] 2.4 Ensure fixture UI and logs do not reference or require Sakti POS source code.

## 3. Deterministic Test Backend

- [ ] 3.1 Add a deterministic local test backend or fixture HTTP service for pull, push, and sync status behavior.
- [ ] 3.2 Seed backend state with deterministic IDs and timestamps for baseline pull.
- [ ] 3.3 Record pushed fixture rows so automation can assert local create and push behavior.
- [ ] 3.4 Add backend reset support per smoke run.
- [ ] 3.5 Document backend startup, port/env configuration, and failure modes.

## 4. Desktop Smoke Automation

- [ ] 4.1 Replace the skipped desktop smoke skeleton with a real WebDriver/Tauri-driver flow against the fixture app.
- [ ] 4.2 Validate app launch, readiness, plugin registration, migration completion, DB info, and Drizzle proxy-backed reads.
- [ ] 4.3 Validate baseline pull renders server fixture rows.
- [ ] 4.4 Validate local row creation persists after app restart.
- [ ] 4.5 Validate manual sync pushes the local row to the deterministic backend.
- [ ] 4.6 Add desktop failure artifact guidance or collection for logs and fixture state.

## 5. Android Smoke Automation

- [ ] 5.1 Replace the Android Maestro skeleton with a real fixture app flow.
- [ ] 5.2 Validate fresh app launch, readiness, SQLite initialization, migration completion, and baseline pull.
- [ ] 5.3 Validate local row creation, manual sync, and visible persisted state.
- [ ] 5.4 Validate clean app-data reset or reinstall produces a fresh baseline sync.
- [ ] 5.5 Add Android failure artifact guidance or collection for logcat and fixture state.

## 6. Scripts And Documentation

- [ ] 6.1 Add opt-in root or package scripts for desktop and Android fixture smoke runs.
- [ ] 6.2 Update `packages/e2e/README.md` with prerequisites, env vars, commands, fixture backend setup, and normal-CI exclusions.
- [ ] 6.3 Document that `docs/external/sakti-pos` is not part of public fixture E2E and private apps should follow the fixture integration pattern separately.
- [ ] 6.4 Update milestone or knowledge docs if needed to reflect that Phase 14 is complete and Phase 15 is fixture-based.

## 7. Verification

- [ ] 7.1 Run fixture app typecheck/build checks.
- [ ] 7.2 Run existing host verification: `cargo test --workspace`.
- [ ] 7.3 Run existing JS verification: `bun test` for Baresync package tests.
- [ ] 7.4 Run e2e package typecheck.
- [ ] 7.5 Run the opt-in desktop smoke command locally when desktop tooling is available.
- [ ] 7.6 Run the opt-in Android smoke command locally when Android/Maestro tooling is available.
