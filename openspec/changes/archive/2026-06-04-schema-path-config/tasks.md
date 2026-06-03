## 1. Generator API and runtime loading

- [x] 1.1 Change the paired generator config types so `apiSyncedSchema` and `localSyncedSchema` accept schema file paths instead of namespace imports.
- [x] 1.2 Update the generator runtime to resolve and load the schema modules from those paths before validation.
- [x] 1.3 Preserve paired table validation, local-only/server-only column checks, and dated artifact generation after loading the schema modules.
- [x] 1.4 Copy frozen schema snapshots from the resolved schema file paths into the dated output directory.

## 2. Tests for the new config flow

- [x] 2.1 Update generator config tests to pass schema file paths and verify paired validation still succeeds.
- [x] 2.2 Add coverage for missing or invalid schema file paths failing with descriptive errors.
- [x] 2.3 Update snapshot generation tests so they assert the copied files come from the explicit schema source paths.
- [x] 2.4 Update CLI and example-driven tests that construct generator configs to use the new path-based schema inputs.

## 3. Skill and docs sync

- [x] 3.1 Update the Baresync skill reference under `skills/baresync/` to document the new config shape and path example.
- [x] 3.2 Update the web docs for generator setup and generated files to describe the path-based schema inputs and snapshot copying behavior.
- [x] 3.3 Follow the Baresync skill runbook flow: verify the skill against source, then update the matching web docs.

## 4. Example and scaffold

- [x] 4.1 Update the `create-baresync` sync-contract template to emit the new path-based config shape.
- [x] 4.2 Update the inventory example sync-contract config to pass schema file paths.

## 5. Verification and cleanup

- [x] 5.1 Run the generator test suite and fix any behavioral regressions introduced by the new loader flow.
- [x] 5.2 Run Ultracite checks and the package typecheck script for the affected packages.
- [x] 5.3 Confirm the OpenSpec artifacts match the implemented change before applying or archiving.
