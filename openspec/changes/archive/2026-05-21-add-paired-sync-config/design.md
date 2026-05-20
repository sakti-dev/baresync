## Context

Baresync currently exposes low-level schema primitives: consumers define Drizzle tables, wrap local tables with `syncedTable(...)`, assemble a `syncSchema(...)`, and pass that contract to the generator. This works, but it only makes the local-side schema first-class. The API-side synced schema can exist in an application package, but the generator config does not require or validate it.

The inventory example needs a Sakti-style split where local synced tables and API synced tables are separate modules. JSON and protobuf should share that setup model: import the local synced schema, import the API synced schema, define generation settings, and run the generator.

## Goals / Non-Goals

**Goals:**

- Add a supported `defineSyncConfig(...)` API that accepts paired local/API synced schemas.
- Preserve autocomplete for table names from shared local/API schema keys.
- Default the supported local/API column differences to `isSynced` and `syncUpdatedAt`.
- Add `localSyncColumns()` and `apiSyncColumns()` helpers for the supported Drizzle table shape.
- Update the inventory example to use the new config and helpers.
- Keep existing `syncedTable(...)`, `syncSchema(...)`, and `generateSyncArtifacts(...)` usage working.
- Remove the older `localSyncRowState` and `apiSyncRowState` object exports in favor of fresh column helper functions.

**Non-Goals:**

- Do not remove or break the current lower-level contract APIs.
- Do not build full API push adapter generation in this change.
- Do not add custom lifecycle-column modes beyond the supported `localSyncColumns()` and `apiSyncColumns()` helpers.
- Do not convert the inventory example to protobuf.

## Decisions

### Add `defineSyncConfig(...)` as the product-facing generator API

`defineSyncConfig(...)` SHALL live in the generator public API and return a `GeneratorConfig` compatible with `generateSyncArtifacts(...)`. It will accept `packageName`, `outputDir`, `localSyncedSchema`, `apiSyncedSchema`, and a `tables` object keyed by shared schema export names.

This keeps JSON config close to Sakti's protobuf config shape while still producing the existing JSON artifacts.

Alternative considered: keep requiring consumers to build `syncSchema(...)` manually. That keeps the API smaller, but it leaves API-side schema as informal metadata and repeats table wrapping boilerplate in every example.

### Infer table keys from paired schema modules

The `tables` object should be typed from the intersection of `localSyncedSchema` and `apiSyncedSchema` keys. This gives autocomplete for table names such as `locations`, `items`, and `stockCounts`, while rejecting keys that exist only in non-synced schema modules.

Runtime validation will still check that configured tables exist on both sides. Type inference improves editor feedback but cannot replace validation for JavaScript consumers or dynamic config loading.

### Use local tables as the runtime contract source

The generated JSON contract will continue to derive row metadata and table ordering from the local synced tables. API synced tables are introduced for paired validation and future generated server adapters.

This avoids changing the existing engine contract format in the same change. The paired API schema becomes first-class without forcing a protocol migration.

### Add supported column helper functions

`localSyncColumns()` will return `deletedAt`, `createdAt`, `updatedAt`, and `isSynced`. `apiSyncColumns()` will return `deletedAt`, `createdAt`, `updatedAt`, and `syncUpdatedAt`.

The helpers are the supported path. Consumers can still hand-write equivalent columns, but validation remains table-based and fails when required sync columns are absent.

### Keep non-synced schema out of generator config

Tables such as `syncBatchRequests`, `syncOutbox`, and `syncCursors` remain real schema definitions, but they do not belong in the paired synced schema config. The config should only include replicated tables.

## Risks / Trade-offs

- [Risk] The new config API duplicates some concepts from `syncSchema(...)`. -> Mitigation: document `defineSyncConfig(...)` as the recommended app-level API and keep `syncSchema(...)` as the lower-level primitive.
- [Risk] API/local drift validation may be too strict for intentional schema differences. -> Mitigation: explicitly allow `localOnlyColumns` and `serverOnlyColumns`, defaulting to the supported columns.
- [Risk] Helper functions may make users think columns are magic markers. -> Mitigation: validation inspects actual Drizzle tables, and docs describe helpers as column shortcuts.
- [Risk] The API schema is first-class before adapter generation exists. -> Mitigation: use it immediately for validation and preserve it in config metadata for future generator outputs.

## Migration Plan

- Add the new supported APIs and remove the older row-state object exports.
- Update inventory to use the new config and helpers as the canonical example.
- Keep existing tests for `syncSchema(...)` and `generateSyncArtifacts(...)`.
- Add new tests for helper columns, paired config inference behavior where practical, and runtime paired schema validation.
