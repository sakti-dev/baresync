## 1. Test-First Regression Fixtures

- [x] 1.1 Read the proposal, design, and generator-diagnostics delta spec before changing production code.
- [x] 1.2 Create `packages/baresync/src/generator/__test__/fixtures/doctor-heuristics.ts` with multiple paired Drizzle tables using distinct scope columns, including valid API indexes, an index with a trailing `id`, and one intentionally missing API index.
- [x] 1.3 Create `packages/baresync/src/generator/__test__/doctor-heuristics.test.ts` and add a failing test proving valid tables in the mixed fixture do not receive `SYNC_INDEX_MISSING_SCOPE_WATERMARK`.
- [x] 1.4 Add a failing test proving only the intentionally invalid table receives `SYNC_INDEX_MISSING_SCOPE_WATERMARK`.
- [x] 1.5 Add failing tests proving default camelCase and snake_case built-in one-sided columns do not receive `SYNC_SCHEMA_BATTERIES_INCLUDED_NOT_1_TO_1`.
- [x] 1.6 Add a failing test proving additional local-only and server-only business columns still receive `SYNC_SCHEMA_BATTERIES_INCLUDED_NOT_1_TO_1`.
- [x] 1.7 Add failing tests proving no fixture table receives `SYNC_INDEX_MISSING_LOCAL_DIRTY`, `SYNC_SCHEMA_NO_CONFLICT_STRATEGY`, or `SYNC_SCHEMA_NO_DELETE_STRATEGY`.
- [x] 1.8 Run `bun test packages/baresync/src/generator/__test__/doctor-heuristics.test.ts` and confirm each new regression fails for the expected current behavior before editing production code.

## 2. Paired Diagnostic Context

- [x] 2.1 Refactor paired schema loading to produce an internal build result containing the runtime `SyncContract` and configured local/API table pairs without changing the public generated contract shape.
- [x] 2.2 Keep `buildContractFromPairedConfig()` compatible for existing callers while making paired generate, `generate --check`, and doctor paths use the richer build result.
- [x] 2.3 Extend diagnostic options with the minimum paired table context needed to resolve the correct API table for each contract table.
- [x] 2.4 Add or update generator/config tests proving schema modules are loaded once per paired build and generated JSON does not contain table or index objects.
- [x] 2.5 Run the focused paired config and generator tests and confirm they pass.

## 3. Evidence-Based Warning Logic

- [x] 3.1 Implement scope-watermark index extraction from Drizzle `getTableConfig(table).indexes` using physical column names and ordered prefix matching.
- [x] 3.2 Treat indexes beginning with `(scope_column, sync_updated_at)` as valid, including indexes with trailing columns.
- [x] 3.3 For paired configs, inspect the API table; for lower-level contracts, inspect the contract table only when it physically contains `sync_updated_at`.
- [x] 3.4 Remove emission of `SYNC_INDEX_MISSING_LOCAL_DIRTY`.
- [x] 3.5 Remove emission of `SYNC_SCHEMA_NO_CONFLICT_STRATEGY` and `SYNC_SCHEMA_NO_DELETE_STRATEGY`.
- [x] 3.6 Update the one-to-one check to normalize aliases, exclude only `isSynced` / `is_synced` and `syncUpdatedAt` / `sync_updated_at`, and warn only when custom one-sided columns remain on both sides.
- [x] 3.7 Run `bun test packages/baresync/src/generator/__test__/doctor-heuristics.test.ts` and confirm the multi-table regression suite passes.
- [x] 3.8 Update existing diagnostics tests that encoded the removed unconditional warnings, retaining coverage for all remaining diagnostics.
- [x] 3.9 Run `bun test packages/baresync/src/generator/__test__/diagnostics.test.ts packages/baresync/src/generator/__test__/doctor-heuristics.test.ts`.

## 4. Public Command Regression Coverage

- [x] 4.1 Add a CLI or generator integration test using a multi-table paired config and real schema files.
- [x] 4.2 Prove doctor reports no heuristic-only warnings for valid fixture tables and attributes a missing scope-watermark warning only to the invalid table.
- [x] 4.3 Prove `generate --check` and normal generation use the same paired diagnostic context as doctor.
- [x] 4.4 Run the focused CLI and generator test files.

## 5. Documentation

- [x] 5.1 Update `apps/docs/content/docs/schema/diagnostics.mdx` to remove the three retired warning codes and describe evidence-based scope-watermark and paired mapping checks.
- [x] 5.2 Update `apps/docs/content/docs/generator/cli.mdx` so sample doctor output does not show unsupported strategy warnings.
- [x] 5.3 Document that paired diagnostics inspect API indexes while generated contracts remain local-derived.

## 6. Integration Verification

- [x] 6.1 Run the complete `packages/baresync` generator and CLI test suites.
- [x] 6.2 Run `bun x baresync doctor` in `examples/inventory-json-polling/packages/sync-contract` and confirm the valid API indexes are recognized.
- [x] 6.3 Run `bun run doctor` in `/home/eekrain/CODE/sakti-pos/packages/sync-contract` and confirm its valid local/API indexes no longer produce heuristic warnings.
- [x] 6.4 Run `bun x ultracite check`; if it reports safe fixes, run `bun x ultracite fix` and rerun the check.
- [x] 6.5 Run `bun run typecheck` and resolve all type errors.
- [x] 6.6 Review the final diff for unrelated changes and verify generated artifact formats remain unchanged.
