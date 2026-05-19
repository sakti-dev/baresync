## 1. Android Target And Backend Preflight

- [x] 1.1 Add or document an Android smoke preflight that verifies `adb devices` has at least one usable target.
- [x] 1.2 Resolve the fixture backend URL for the selected Android target, including emulator `10.0.2.2` and physical-device LAN host cases.
- [x] 1.3 Ensure the fixture backend reset endpoint is called before the Android smoke flow starts.
- [x] 1.4 Fail with actionable diagnostics when adb, Maestro, app id, backend URL, or fixture backend readiness is missing.

## 2. Android Fixture App Install And Launch

- [x] 2.1 Verify the public fixture Android app can be built or installed for the connected target.
- [x] 2.2 Ensure the Android smoke launches the configured fixture app id.
- [x] 2.3 Wait for fixture ready status using stable visible UI text or durable test identifiers.
- [x] 2.4 Validate DB path, migration count, and Drizzle proxy-backed read visibility in the Android UI.

## 3. Desktop-Aligned Android Smoke Flow

- [x] 3.1 Trigger baseline sync and assert deterministic backend rows render from local SQLite in the Android UI.
- [x] 3.2 Create the fixture local category and product and assert both rows render before manual sync.
- [x] 3.3 Trigger manual sync and assert the fixture backend records the pushed category and product.
- [x] 3.4 Assert the Android UI marks the local category and product clean or synced after manual sync.
- [x] 3.5 Restart or relaunch the Android app and assert the created rows, clean state, and satisfied baseline state survive from SQLite.
- [x] 3.6 Clear app data or reinstall the fixture app and assert a fresh run starts from clean local state and repeats baseline pull.

## 4. Failure Evidence And Documentation

- [x] 4.1 Collect or document Maestro output, adb logcat, fixture backend state, app id, device id, backend URL, reset method, and generated fixture build metadata on failure.
- [x] 4.2 Update `packages/e2e/README.md` with Android prerequisites, backend URL rules, app install/launch assumptions, and the verified command.
- [x] 4.3 Update `docs/knowledge/E2E-TESTING-RUNBOOK.md` so future agents know Android E2E is only verified after a connected adb run passes.
- [x] 4.4 Keep Android guidance and artifacts independent from `docs/external/sakti-pos` and private consumer app data.

## 5. Verification

- [x] 5.1 Run `openspec validate android-fixture-device-e2e-verification --strict`.
- [x] 5.2 Run `bun run typecheck:e2e`.
- [x] 5.3 Run fixture app typecheck/build verification needed by the Android smoke.
- [x] 5.4 Run `bun --cwd packages/e2e run android:sync` against the connected adb target and record the result.
- [x] 5.5 Run existing required checks affected by this change, including Ultracite and relevant typechecks.
