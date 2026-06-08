## Context

The diagnostic system was introduced for contracts where one Drizzle table carried both local and server sync metadata. Paired schema configuration was added later and deliberately builds the runtime `SyncContract` from local tables while using API tables only for drift validation.

That separation creates three classes of false warning:

1. Some checks never inspect schema metadata and warn unconditionally.
2. API-side checks run against a contract that only retains local tables.
3. Older strategy and dirty-row assumptions no longer match the public config or runtime.

The current data flow is:

```text
local schema ──▶ runtime SyncContract ──▶ runDiagnostics(contract)
API schema   ──▶ paired column validation only
```

The desired diagnostic flow is:

```text
local schema ──┐
               ├─▶ paired build result ──▶ runDiagnostics(contract, context)
API schema   ──┘
                         │
                         └─▶ runtime SyncContract remains local-derived
```

## Goals / Non-Goals

**Goals:**

- Make every remaining warning evidence-based and actionable.
- Validate API scope-watermark indexes against API tables.
- Preserve the existing runtime contract and generated artifact formats.
- Preserve `runDiagnostics(contract)` for lower-level and legacy callers.
- Treat the paired-schema built-in local/server differences as expected.
- Add regression coverage for canonical paired schemas and genuinely missing indexes.

**Non-Goals:**

- Do not add conflict or delete strategy configuration in this change.
- Do not change runtime conflict resolution, soft-delete behavior, or outbox processing.
- Do not add an `is_synced` index requirement to local schemas.
- Do not serialize Drizzle table or index metadata into generated contracts.
- Do not redesign all diagnostics or change existing error severity policy.

## Decisions

### Decision 1: Keep paired diagnostic context separate from the runtime contract

Paired schema loading SHALL internally retain each configured local/API table pair and pass that context to diagnostics. The public `SyncContract` and generated JSON SHALL remain unchanged.

The generator can expose or use an internal paired build result shaped conceptually as:

```ts
interface PairedContractBuild {
  contract: SyncContract;
  tables: Array<{
    apiTable: AnySQLiteTable;
    exportName: string;
    localTable: AnySQLiteTable;
  }>;
}
```

`buildContractFromPairedConfig()` remains compatible by returning only `contract`, while paired generate, check, and doctor paths use the richer internal result.

Alternative considered: attach API tables to `SyncContract`. Rejected because API tables are diagnostic source metadata, not runtime protocol data, and should not leak into contract serialization or consumers.

Alternative considered: reload schema modules in a separate diagnostics function. Rejected because generation already loads both modules and should not repeat work or create two loading paths.

### Decision 2: Detect the scope-watermark index by ordered columns

The API-side warning SHALL inspect `getTableConfig(apiTable).indexes`. A valid index begins with:

```text
[configured scope column, sync_updated_at]
```

Additional trailing columns, such as `id`, are allowed. Index names are irrelevant.

This matches SQLite's left-prefix index behavior and supports both the existing two-column examples and a future deterministic three-column index.

For lower-level contracts without paired API context, the check SHALL inspect the contract table only when that table physically contains `sync_updated_at`. If the available table does not contain the server watermark column, diagnostics cannot prove the API index is missing and SHALL remain silent.

Alternative considered: require an exact two- or three-column shape. Rejected because trailing columns do not invalidate the useful prefix and index naming is application-defined.

### Decision 3: Remove the local dirty-index warning

`SYNC_INDEX_MISSING_LOCAL_DIRTY` SHALL no longer be emitted.

Current push discovery queries `sync_outbox` for unsynced operations and joins source rows by primary key. It does not find pending changes by scanning each synced table for `is_synced = 0`. Keeping this warning would encode a stale performance model.

Alternative considered: retain the warning and merely inspect local indexes. Rejected because an accurately detected index would still be recommended for the wrong runtime query.

### Decision 4: Ignore only built-in one-sided sync columns

The one-to-one diagnostic SHALL normalize camelCase and snake_case names, then exclude:

- Local built-in: `isSynced` / `is_synced`
- Server built-in: `syncUpdatedAt` / `sync_updated_at`

It SHALL warn only when at least one additional local-only business column and at least one additional server-only business column remain.

This preserves a useful warning for genuinely complex paired mappings without penalizing the default supported schema shape.

Alternative considered: remove the warning completely. Rejected because simultaneous custom one-sided business fields can still indicate a mapping that batteries-included tooling cannot safely infer.

### Decision 5: Remove unsupported strategy warnings

`SYNC_SCHEMA_NO_CONFLICT_STRATEGY` and `SYNC_SCHEMA_NO_DELETE_STRATEGY` SHALL no longer be emitted or documented.

Although the lower-level `SyncedTableDefinition` type contains these optional fields, they are not represented by paired config, generated contract JSON, or runtime behavior. A default warning whose fix is unavailable through the recommended API is not actionable.

If strategy metadata becomes a supported runtime feature later, a separate change can specify its config, serialization, semantics, and diagnostics together.

### Decision 6: Test behavior at both diagnostic and public CLI boundaries

Focused fixture tests SHALL cover:

- a reusable paired schema with multiple related tables and different scope columns,
- valid paired API scope-watermark index,
- missing paired API scope-watermark index,
- accepted index with trailing columns,
- default built-in local/server differences,
- custom one-sided business columns on both sides,
- absence of removed warnings.

The fixture SHALL include enough tables to prove diagnostics preserve table identity and do not reuse one table's API metadata for another table. At least one public `doctor` regression SHALL prove the valid tables report no heuristic-only warnings while a deliberately invalid table reports only its own expected warning. The inventory and Sakti POS commands SHALL be rerun as manual integration verification.

## Risks / Trade-offs

- **[Risk] Drizzle index metadata shape changes across supported versions.** → Use `getTableConfig()` and column names already provided by Drizzle's public SQLite metadata surface; cover extraction with real `sqliteTable` fixtures.
- **[Risk] Legacy contracts lose a scope-index warning when only local schema metadata is available.** → Prefer no warning over an unprovable warning; paired config remains the recommended path and supplies both sides.
- **[Risk] Removing warning codes affects CI using `--warnings-as-errors`.** → This is intentional noise reduction; document removed codes and keep real schema errors unchanged.
- **[Risk] Custom names for sync metadata are not recognized as built-ins.** → Baresync currently requires the standard `is_synced` and `sync_updated_at` columns, so normalization only needs supported aliases.
- **[Risk] A scope-watermark index exists in migrations but not the Drizzle table declaration.** → `doctor` validates declared schema metadata. Users must keep Drizzle schema and migrations aligned for the warning to clear.

## Migration Plan

1. Add a reusable multi-table paired fixture and failing tests for paired index and built-in-column behavior.
2. Add paired diagnostic context without changing generated contract output.
3. Make the scope-watermark warning inspect ordered API index columns.
4. remove stale dirty-index and unsupported strategy warnings.
5. Update one-to-one filtering and tests.
6. Update public diagnostics documentation.
7. Verify focused tests, full package tests, inventory doctor, Sakti POS doctor, Ultracite, and typecheck.

Rollback is a normal source revert. No generated contract migration or runtime data migration is required.

## Open Questions

None. The selected policy is:

```text
warn only when the diagnostic has the correct schema side,
can prove the condition, and can provide an actionable fix
```
