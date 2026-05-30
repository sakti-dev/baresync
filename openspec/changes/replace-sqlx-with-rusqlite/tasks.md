## 1. Prerequisite And TDD Baseline

- [ ] 1.1 Confirm `introduce-db-worker-abstraction` has been applied or otherwise rebase this change onto a codebase where `DbClient` is the database facade.
- [ ] 1.2 Read `openspec/knowledge/E2E-TESTING-RUNBOOK.md` before changing or verifying Tauri, fixture app, Android, or E2E smoke behavior.
- [ ] 1.3 Add failing `DbClient` parity tests for parameter binding, dynamic row conversion, rows affected, last insert rowid, null/integer/real/text/blob handling, and error mapping.
- [ ] 1.4 Add failing worker tests for serialized request execution, dropped reply handling, transaction rollback, and no interleaving inside batch requests.
- [ ] 1.5 Add failing migration parity tests proving existing migration records and plaintext SQLite files created by the SQLx backend still open and behave correctly.

## 2. Dependency Swap

- [ ] 2.1 Add `rusqlite` to `crates/baresync-core` with plaintext SQLite features only.
- [ ] 2.2 Remove SQLx from `crates/baresync-core` once the backend no longer imports it.
- [ ] 2.3 Remove SQLx from `crates/tauri-plugin-baresync` once tests and command helpers no longer import it.
- [ ] 2.4 Update Cargo/OpenSpec/docs references that describe SQLx as the local client database backend.

## 3. Worker Backend Implementation

- [ ] 3.1 Implement the `rusqlite` worker thread owned by `DbClient`.
- [ ] 3.2 Implement bounded request/reply message handling with worker shutdown when all senders are dropped.
- [ ] 3.3 Implement connection startup settings: create-if-missing behavior, WAL mode, normal synchronous mode, busy timeout, and foreign keys.
- [ ] 3.4 Implement dropped reply behavior so completed worker operations do not panic if the caller is gone.

## 4. Query And Transaction Port

- [ ] 4.1 Port SQL parameter binding from SQLx to `rusqlite`.
- [ ] 4.2 Port row conversion from SQLx rows to Baresync dynamic rows.
- [ ] 4.3 Port execute metadata collection for affected rows and last insert rowid.
- [ ] 4.4 Port `run_sql` and `run_sql_batch` to the `rusqlite` worker backend.
- [ ] 4.5 Ensure batch requests execute fully inside one worker-owned transaction.

## 5. Core Behavior Port

- [ ] 5.1 Port migration runner internals to execute through `rusqlite` worker requests.
- [ ] 5.2 Port schema inspection helpers to `rusqlite`.
- [ ] 5.3 Port cursor, outbox, local state, cleanup, GC, push, and pull helpers to the `rusqlite` worker backend.
- [ ] 5.4 Confirm sync engine behavior remains unchanged for push, pull, status, cleanup, and simulation tests.

## 6. Plugin And Docs

- [ ] 6.1 Confirm Tauri plugin setup still opens the DB, runs migrations, and manages command state only after successful setup.
- [ ] 6.2 Confirm plugin command behavior, data-changed events, and polling notifications remain unchanged.
- [ ] 6.3 Update Rust API docs, production docs, and troubleshooting docs to remove SQLx backend references.
- [ ] 6.4 Confirm JS/TypeScript docs remain unchanged unless they mention SQLx internals.

## 7. Verification

- [ ] 7.1 Run `cargo test -p baresync-core`.
- [ ] 7.2 Run `cargo test -p tauri-plugin-baresync --test commands`.
- [ ] 7.3 Run any relevant simulation or fixture tests affected by database behavior.
- [ ] 7.4 Run `cargo test --workspace`.
- [ ] 7.5 Run desktop Tauri build or compile verification if plugin build behavior changed.
- [ ] 7.6 Run Android compile/APK verification for the plaintext `rusqlite` backend.
- [ ] 7.7 Run `bun x ultracite check`.
- [ ] 7.8 Run `bun run typecheck`.
- [ ] 7.9 Run `openspec status --change replace-sqlx-with-rusqlite` and confirm artifacts/tasks remain valid.
