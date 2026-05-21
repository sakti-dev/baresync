## 1. Coverage Baseline and Gates

- [ ] 1.1 Measure the current per-crate Rust coverage baseline and record the starting numbers.
- [ ] 1.2 Wire the Rust coverage command to report `baresync-core` and `tauri-plugin-baresync` separately.
- [ ] 1.3 Add fail-under checks for the agreed crate-level coverage floors.

## 2. `baresync-core` Coverage Expansion

- [ ] 2.1 Add host-side tests for push, pull, status, cursor progression, and idempotency paths.
- [ ] 2.2 Add tests for pagination, delete-only sync, mixed changed/deleted rows, and server-wins reconciliation.
- [ ] 2.3 Add protobuf encode/decode coverage for status and pull request/response boundaries.
- [ ] 2.4 Add error-path tests for malformed payloads and propagation of sync failures.

## 3. `tauri-plugin-baresync` Coverage Expansion

- [ ] 3.1 Add builder tests for encoding selection, transport validation, and default configuration behavior.
- [ ] 3.2 Add command tests for DB proxy behavior, migrations, and event emission.
- [ ] 3.3 Add host-side plugin tests that exercise registration with temporary SQLite and embedded migrations.

## 4. Ratchet and Documentation

- [ ] 4.1 Update the README with the final Rust coverage floor and the commands used to measure it.
- [ ] 4.2 Re-run Ultracite, typecheck, and Rust coverage verification after the test additions land.
