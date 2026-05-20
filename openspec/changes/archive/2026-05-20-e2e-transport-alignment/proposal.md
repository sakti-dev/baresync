## Why

Public fixture E2E currently proves the JSON transport path, but protobuf is now a supported transport too. Without running the same smoke scenario against both encodings, we can regress one wire format while the other still passes, which weakens the value of the public fixture.

## What Changes

- Parameterize the public fixture smoke harness so the same scenario can run in `json` and `protobuf` transport modes.
- Thread a shared transport mode through the fixture app and fixture backend wiring used by E2E.
- Reuse the same baseline pull, local create, manual sync, restart persistence, and clean-state assertions for both transports.
- Keep the canonical JSON sync fixtures as the source of truth and derive protobuf coverage from the same logical payloads.
- Update E2E docs and run commands so the supported transport matrix is explicit.

## Capabilities

### Modified Capabilities
- `public-fixture-device-e2e`: public fixture smoke scenarios gain transport-matrix coverage so JSON and protobuf runs execute the same behavior against the same fixture app and backend.

## Impact

- `tests/e2e` smoke harness and backend fixture
- `tests/fixture-app` runtime configuration and launch path
- Public fixture smoke documentation and runbook guidance
- E2E verification commands and transport-specific test setup
