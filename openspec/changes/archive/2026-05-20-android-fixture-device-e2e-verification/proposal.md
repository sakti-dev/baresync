## Why

The public fixture E2E work proved the desktop path, but Android remains an implemented scaffold until it is run against a connected adb device or emulator. Now that adb devices are available, the repo needs an explicit change that turns the Android smoke from "prepared" into verified behavior.

## What Changes

- Implement and verify the Android fixture smoke flow against a real connected adb target.
- Ensure Android can reach the deterministic fixture backend using the correct host address for emulator or physical device.
- Validate install/launch/reset behavior, SQLite initialization, migrations, baseline pull, local create, manual sync push, and app data reset.
- Capture useful Android failure evidence such as Maestro output, logcat, and fixture backend state.
- Update documentation to distinguish verified Android behavior from prerequisites and known environment assumptions.

## Capabilities

### New Capabilities

- `android-fixture-device-e2e-verification`: Covers connected-device Android fixture smoke execution, backend reachability, lifecycle reset, and failure artifacts.

### Modified Capabilities

- `public-fixture-device-e2e`: Clarifies that Android smoke is only considered complete when run successfully against a connected adb device or emulator.

## Impact

- `packages/e2e/android/`
- `packages/e2e/package.json`
- `packages/e2e/README.md`
- `apps/baresync-fixture/src-tauri/`
- `docs/knowledge/E2E-TESTING-RUNBOOK.md`
- `openspec/specs/public-fixture-device-e2e/spec.md`
