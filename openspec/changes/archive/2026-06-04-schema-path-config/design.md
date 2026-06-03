## Context

Baresync currently expects paired generator configs to receive imported Drizzle schema namespaces and, optionally, a separate `schemaSourceDir` for frozen snapshot copying. That split works only when callers manage both the live schema objects and the source directory correctly, which is easy to get wrong and leaves the snapshot source disconnected from the actual schema inputs.

The requested change makes the schema inputs path-based instead: callers pass file paths for the API and local schema modules, and Baresync loads those modules itself before validation and snapshot generation. This affects the generator API, the CLI/example config shape, the Baresync skill reference under `skills/baresync/`, and the web docs. Per `openspec/knowledge/BARESYNC-SKILL-RUNBOOK.md`, source changes must flow into skills first and then into docs.

## Goals / Non-Goals

**Goals:**
- Make the paired generator API accept schema file paths instead of imported schema namespace objects.
- Keep the existing paired schema validation behavior, including local-only/server-only column checks.
- Continue generating frozen schema snapshots in the dated output directory.
- Update the bundled skill reference and web docs so the new config shape is the default documented path.
- Update examples and scaffolding so new users start from the path-based API.

**Non-Goals:**
- Change the JSON contract format or dated output directory layout.
- Change the set of generated files besides how schema snapshots are sourced.
- Redesign the sync contract validation rules themselves.
- Introduce a new package dependency or a custom module loader.

## Decisions

1. Keep the existing paired config shape, but change `apiSyncedSchema` and `localSyncedSchema` from namespace objects to schema file paths.

   Rationale: this keeps the API surface smaller than introducing new `*Path` fields while still making the input explicit. It also makes the breaking change obvious at the call site.

   Alternatives considered:
   - Add new `apiSyncedSchemaPath` / `localSyncedSchemaPath` fields. Rejected because it creates a parallel API without removing the old one cleanly.
   - Keep imported schema objects and require `schemaSourceDir`. Rejected because it preserves the original split responsibility that caused the confusion.
   - Add a `configUrl` parameter and infer paths. Rejected because the user explicitly wants the schema inputs to be the path strings.

2. Load schema modules during artifact generation, not inside the config builder.

   Rationale: the generator needs the loaded schema modules to validate paired tables and to copy frozen snapshots from the exact source files. Keeping the path resolution and module loading inside the generation flow centralizes the runtime behavior in one place.

   This likely means the generation entrypoint becomes async so it can use dynamic imports for the schema files. That is the cleanest way to load TypeScript/ESM source modules without introducing a custom loader.

   Alternatives considered:
   - Make `defineSyncConfig` async and load modules there. Rejected because config creation becomes awkward and pushes async into the user’s sync config module.
   - Keep the generation API sync and require a CJS-style loader. Rejected because the repo already uses modern module loading patterns and the schema files are TypeScript/ESM sources.

3. Resolve schema paths as explicit filesystem paths and document caller-side normalization.

   Rationale: the API should not guess the config file directory. Callers can compute absolute paths in `sync.config.ts` using `import.meta.url` and `fileURLToPath`, which makes the source location unambiguous and avoids cwd-dependent surprises.

   Alternatives considered:
   - Require absolute paths only. Rejected because relative paths are still practical and can be normalized by the caller.
   - Infer paths relative to the current working directory. Rejected because config discovery and execution contexts can differ, especially in CLI usage.

4. Copy frozen snapshots from the same resolved source files used for loading.

   Rationale: snapshots should reflect exactly the schema modules that were validated. Using the resolved source file paths prevents drift between validation inputs and copied artifacts.

   Alternatives considered:
   - Continue accepting a separate `schemaSourceDir`. Rejected because it reintroduces a second source of truth.
   - Infer snapshot paths from runtime module metadata. Rejected because module-origin metadata is not portable enough for a build tool.

5. Update documentation and the Baresync skill reference to show a path-based example that computes absolute paths from `import.meta.url`, in the runbook order: source code → skills → docs.

   Rationale: this gives users a migration pattern that is explicit, works in the repo’s ESM-oriented config files, and avoids ambiguous cwd-relative examples.

## Risks / Trade-offs

- [Async ripple] → Making generation async will touch CLI plumbing and tests. Mitigation: centralize module loading in a single helper and keep the rest of the generation pipeline unchanged.
- [Path ambiguity] → Relative path inputs can be confusing if callers do not normalize them. Mitigation: document an `import.meta.url`-based example and prefer absolute paths in generated templates.
- [Runtime loader mismatch] → Loading TypeScript source files through dynamic import depends on the surrounding runtime/tooling. Mitigation: keep the change aligned with the repo’s existing TS/ESM loading strategy and cover it with integration tests.
- [Migration breakage] → Existing configs that pass imported schema objects will fail at compile time. Mitigation: update the bundled skill, docs, example contract, and scaffold template in the same change, and call out the breaking change in the proposal.

## Migration Plan

1. Update the generator config types and runtime loading flow to accept path strings for the API and local schema modules.
2. Make the generation entrypoint load, validate, and snapshot the schema modules from those paths.
3. Update the example contract package and the package scaffolder template to emit the new config shape.
4. Update the bundled skill reference and the docs site so the new API is the documented default.
5. Update tests to cover the path-based config, snapshot copying, and failure cases for missing files.
6. If the new loader behavior causes issues, rollback by reverting the config API and generator loading changes together; there is no persisted state to migrate.

## Open Questions

- Should schema file paths be accepted as absolute paths only, or should the generator resolve relative paths against the config file location?
- Should the generator load schema files directly inside `generateSyncArtifacts`, or should there be a separate async config-loading helper that returns a ready-to-run generator config?
- Do we want the path-based API to keep the existing field names (`apiSyncedSchema`, `localSyncedSchema`) or rename them to make the file-path semantics more obvious in code?
