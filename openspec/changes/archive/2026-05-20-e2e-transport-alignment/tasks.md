## 1. Transport Contract

- [x] 1.1 Define the shared transport mode contract for the public fixture smoke flow
- [x] 1.2 Thread transport mode through the fixture app launch path and smoke backend setup
- [x] 1.3 Keep JSON as the default mode and protobuf as an explicit alternative

## 2. Shared Smoke Matrix

- [x] 2.1 Parameterize the desktop smoke scenario by encoding
- [x] 2.2 Reuse the same baseline, local-create, sync, and restart assertions for JSON and protobuf desktop runs
- [x] 2.3 Extend the Android smoke path to consume the same transport mode contract

## 3. Verification And Docs

- [x] 3.1 Add or adjust transport matrix coverage so both encodings are exercised
- [x] 3.2 Update the E2E runbook and fixture docs to describe the dual-transport smoke flow
- [x] 3.3 Verify both transports through the documented desktop and Android smoke commands
