## Context

The public fixture device E2E change produced a real desktop smoke and an Android automation path, but Android was not proven on a connected adb target. A connected device or emulator is now available, so this change narrows the remaining risk: prove Android install, launch, host networking, SQLite lifecycle, migrations, sync, and reset behavior with the public fixture app.

The existing fixture app and backend remain the target. This change should not introduce a second fixture app or depend on `openspec/external/sakti-pos`.

## Goals / Non-Goals

**Goals:**

- Make Android fixture E2E verification explicit in OpenSpec tasks and acceptance criteria.
- Run the Android smoke against a connected adb device or emulator.
- Resolve Android host networking for the deterministic fixture backend.
- Verify app install or launch, readiness, migrations, baseline pull, local create, manual sync push, and app data reset.
- Keep Android smoke assertions aligned with the desktop fixture smoke: ready status, DB path, migration count, baseline pull, local create render, backend push assertion, clean state, restart persistence, and baseline satisfied state.
- Capture actionable Android failure evidence.

**Non-Goals:**

- Do not replace host simulation, Rust tests, JS tests, or desktop smoke with Android E2E.
- Do not make Android device automation part of normal CI.
- Do not use Sakti POS or private app source as an Android E2E target.
- Do not add broad sync protocol edge cases to the Android UI flow.

## Decisions

### Treat Android as a separate verification target

Android has platform-specific risk that desktop does not cover: adb availability, APK install, app id, WebView timing, emulator or physical-device networking, Android app data reset, and filesystem behavior. The implementation should keep the flow semantically aligned with the desktop smoke, and the acceptance criteria must require a real adb run.

Alternative considered: assume Android works because desktop works. That is rejected because Android-specific lifecycle and networking failures are common and cannot be inferred from desktop.

### Reuse the public fixture backend with target-specific URL mapping

The fixture backend remains the deterministic sync server. The Android app should receive a backend URL reachable from the selected target: `10.0.2.2` for the standard emulator case, or a LAN-reachable host address for physical devices.

Alternative considered: run the backend inside the app or on-device. That would add complexity and reduce confidence that the plugin handles real HTTP boundaries.

### Keep failure evidence public-safe

The fixture uses synthetic data, so logcat, Maestro output, and fixture backend state are safe to collect by default. The runbook should still document artifact locations and avoid private app assumptions.

Alternative considered: only print runner output. That is insufficient for Android failures, where logcat and backend state are usually needed to separate app launch, network, DB, and sync problems.

## Risks / Trade-offs

- Emulator and physical devices need different backend host addresses -> expose environment variables and document the expected mapping.
- Maestro selectors can be timing-sensitive -> prefer stable visible text or durable IDs and wait for readiness before interactions.
- Android builds can be slow -> keep the smoke opt-in and outside normal CI.
- App reset can accidentally leave stale state -> explicitly clear app data or reinstall and assert fresh baseline behavior.
- Device logs can be noisy -> filter or preserve enough context around the app id and failed action.

## Migration Plan

This is additive. Keep existing desktop and host verification unchanged. Implement or fix only the Android smoke scripts/config/docs needed to pass against the connected adb target.

Rollback is to leave Android documented as scaffolded and keep desktop fixture E2E as the verified device smoke path.

## Open Questions

- Whether the connected target is an emulator using `10.0.2.2` or a physical device that needs the host LAN IP.
- Whether the Android fixture app should be built by the smoke command or prebuilt before the smoke command runs.
