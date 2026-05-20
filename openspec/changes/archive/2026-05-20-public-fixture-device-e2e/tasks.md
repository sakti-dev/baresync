## 1. Fixture App Foundation

- [x] 1.1 Choose and create the public fixture app workspace path.
- [x] 1.2 Add a minimal Tauri app shell with build/dev scripts and workspace wiring.
- [x] 1.3 Register `tauri-plugin-baresync` in the fixture app with fixture DB path, JSON encoding, contract table order, and embedded migrations.
- [x] 1.4 Add fixture schema, migrations, and sync contract metadata for a small deterministic category/product-style model.
- [x] 1.5 Wire the fixture frontend through `packages/baresync` JS APIs, `createSyncClient`, and `createTauriDrizzleDatabase`.

## 2. Fixture UI And State Controls

- [x] 2.1 Add stable fixture UI controls or durable test identifiers for app readiness, DB status, migration status, baseline sync, local row creation, manual sync, and persisted row display.
- [x] 2.2 Add fixture-side state reset behavior suitable for smoke runs without depending on previous test order.
- [x] 2.3 Add restart-safe local persistence checks through SQLite-backed fixture data.
- [x] 2.4 Ensure fixture UI and logs do not reference or require Sakti POS source code.

## 3. Deterministic Test Backend

- [x] 3.1 Add a deterministic local test backend or fixture HTTP service for pull, push, and sync status behavior.
- [x] 3.2 Seed backend state with deterministic IDs and timestamps for baseline pull.
- [x] 3.3 Record pushed fixture rows so automation can assert local create and push behavior.
- [x] 3.4 Add backend reset support per smoke run.
- [x] 3.5 Document backend startup, port/env configuration, and failure modes.

## 4. Desktop Smoke Automation

- [x] 4.1 Replace the skipped desktop smoke skeleton with a real WebDriver/Tauri-driver flow against the fixture app.
- [x] 4.2 Validate app launch, readiness, plugin registration, migration completion, DB info, and Drizzle proxy-backed reads.
- [x] 4.3 Validate baseline pull renders server fixture rows.
- [x] 4.4 Validate local row creation persists after app restart.
- [x] 4.5 Validate manual sync pushes the local row to the deterministic backend.
- [x] 4.6 Add desktop failure artifact guidance or collection for logs and fixture state.

## 5. Android Smoke Automation

- [x] 5.1 Replace the Android Maestro skeleton with a real fixture app flow.
- [x] 5.2 Validate fresh app launch, readiness, SQLite initialization, migration completion, and baseline pull.
- [x] 5.3 Validate local row creation, manual sync, and visible persisted state.
- [x] 5.4 Validate clean app-data reset or reinstall produces a fresh baseline sync.
- [x] 5.5 Add Android failure artifact guidance or collection for logcat and fixture state.

## 6. Scripts And Documentation

- [x] 6.1 Add opt-in root or package scripts for desktop and Android fixture smoke runs.
- [x] 6.2 Update `packages/e2e/README.md` with prerequisites, env vars, commands, fixture backend setup, and normal-CI exclusions.
- [x] 6.3 Document that `openspec/external/sakti-pos` is not part of public fixture E2E and private apps should follow the fixture integration pattern separately.
- [x] 6.4 Update milestone or knowledge docs if needed to reflect that Phase 14 is complete and Phase 15 is fixture-based.

## 7. Verification

- [x] 7.1 Run fixture app typecheck/build checks.
- [x] 7.2 Run existing host verification: `cargo test --workspace`.
- [x] 7.3 Run existing JS verification: `bun test` for Baresync package tests.
- [x] 7.4 Run e2e package typecheck.
- [x] 7.5 Run the opt-in desktop smoke command locally when desktop tooling is available.
- [x] 7.6 Check the opt-in Android smoke command locally when Android/Maestro tooling is available. Maestro is provided by the default Nix dev shell; a full run still requires a built fixture Android app and connected device/emulator.
