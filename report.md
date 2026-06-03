── Unused Code ─────────────────────────────────────

● Unused files (48)
  examples/inventory-json-polling/apps/app/src/App.tsx
  examples/inventory-json-polling/apps/app/src/app.css
  examples/inventory-json-polling/apps/app/src/components/DataTable.tsx
  examples/inventory-json-polling/apps/app/src/components/SeedPanel.tsx
  examples/inventory-json-polling/apps/app/src/components/StatusMessage.tsx
  examples/inventory-json-polling/apps/app/src/components/SyncBadge.tsx
  examples/inventory-json-polling/apps/app/src/components/SyncPanel.tsx
  examples/inventory-json-polling/apps/app/src/components/__test__/DataTable.test.tsx
  examples/inventory-json-polling/apps/app/src/hooks/__test__/useBaresyncEventBridge.test.ts
  examples/inventory-json-polling/apps/app/src/hooks/useBaresyncQuery.tsx
  ... and 38 more (--format json for full list)
  Files not reachable from any entry point — https://docs.fallow.tools/explanations/dead-code#unused-files
  To suppress: // fallow-ignore-next-line unused-files

● Unused exports (19)
  tests/fixture-app/src/fixture-schema.ts (8)
    :33 syncOutbox
    :44 syncCursors
    :51 syncedCategories
    :55 syncedProducts
    :60 syncContract
    ... and 3 more (--format json for full list)
  packages/baresync/src/server/__test__/fixtures.ts (3)
    :33 serverWinsRejection
    :56 statusRequest
    :58 statusResponse
  apps/docs/src/components/mdx.tsx
    :6 getMDXComponents
  apps/docs/src/lib/shared.ts
    :3 docsImageRoute
  packages/baresync/src/cli/generator.ts
    :187 runDoctor
  packages/baresync/src/generator/config.ts
    :92 getColumnNames
  packages/baresync/src/server/chunking.ts
    :5 DEFAULT_MAX_EVENTS_PER_INSERT_CHUNK
  packages/baresync/src/skills/install.ts
    :60 detectGlobalHarnesses
  packages/create-baresync/src/write.ts
    :34 pathExists
  tests/e2e/fixture-transport.ts
    :6 parseFixtureTransportMode
  Exported symbols with no known consumers — https://docs.fallow.tools/explanations/dead-code#unused-exports
  To auto-fix: fallow fix --dry-run
  To suppress: // fallow-ignore-next-line unused-exports
  (50 more in files already reported as unused)
  7 in src, 12 in test directories
  (4 more in files already reported as unused)

● Unused class members (1)
  packages/baresync/src/server/idempotency.ts
    :12 ConflictRequestError.status
  Class methods or properties never referenced outside their class — https://docs.fallow.tools/explanations/dead-code#unused-class-members

── Dependencies ─────────────────────────────────────

● Unused dependencies (2)
  next-themes (apps/docs/package.json)
  baresync (tests/fixture-app/package.json; imported in packages/create-baresync)
  Listed in dependencies but never imported — https://docs.fallow.tools/explanations/dead-code#unused-dependencies

● Unused devDependencies (4)
  ultracite
  @wdio/mocha-framework (tests/e2e/package.json)
  @wdio/local-runner (tests/e2e/package.json)
  @wdio/spec-reporter (tests/e2e/package.json)
  Listed in devDependencies but never imported or referenced — https://docs.fallow.tools/explanations/dead-code#unused-dependencies
  To suppress: // fallow-ignore-next-line unused-dependencies

● Unresolved imports (11)
  packages/create-baresync/src/templates/app/db-helper.ts (4)
    :2 ../../../packages/sync-contract/src/local-synced-schema
    :2 ../../../packages/sync-contract/src/local-synced-schema
    :4 ../../../packages/sync-contract/src/local-schema
    :5 ../../../packages/sync-contract/src/local-schema
  packages/create-baresync/src/templates/app/drizzle-local-config.ts (2)
    :3 ../../packages/sync-contract/src/local-schema
    :4 ../../packages/sync-contract/src/local-schema
  packages/create-baresync/src/templates/server/drizzle-config.ts
    :2 ../../packages/sync-contract/src/api-schema
  packages/create-baresync/src/templates/server/src/index-elysia.ts
    :2 ./v1/routes
  packages/create-baresync/src/templates/server/src/index-hono.ts
    :2 ./v1/routes
  packages/create-baresync/src/templates/server/src/v1/routes-elysia.ts
    :8 ../db/v1/sync-repository
  packages/create-baresync/src/templates/server/src/v1/routes-hono.ts
    :8 ../db/v1/sync-repository
  Import paths that could not be resolved — check for missing packages or broken paths. Framework-specific imports may need a plugin: https://docs.fallow.tools/plugins — https://docs.fallow.tools/explanations/dead-code#unresolved-imports
  To suppress: // fallow-ignore-next-line unresolved-imports

● Unlisted dependencies (11)
  @sync-contract/generated
  @tailwindcss/vite
  @tanstack/react-query
  @tauri-apps/api
  @testing-library/react
  baresync
  better-sqlite3
  elysia
  hono
  react
  ... and 1 more (--format json for full list)
  Packages imported in code but missing from package.json — https://docs.fallow.tools/explanations/dead-code#unlisted-dependencies
  To suppress: // fallow-ignore-next-line unlisted-dependencies

● Duplicates (80 clone groups)

     59 lines  2 instances  dup:bc17cf89
    tests/e2e/android/install-fixture.ts:104-162
    tests/e2e/android/run-adb-smoke.ts:56-107

     54 lines  2 instances  dup:264218bd
    packages/baresync/src/server/__test__/drizzle.test.ts:452-505
    packages/baresync/src/server/__test__/drizzle.test.ts:514-567

     53 lines  3 instances  dup:7e97e56b
    packages/baresync/src/server/__test__/drizzle.test.ts:337-389
    packages/baresync/src/server/__test__/drizzle.test.ts:452-504
    packages/baresync/src/server/__test__/drizzle.test.ts:514-566

     51 lines  2 instances  dup:8b4ab778
    examples/inventory-json-polling/packages/sync-contract/generated/2026-06-01/api-synced-schema.ts:1-51
    examples/inventory-json-polling/packages/sync-contract/src/api-synced-schema.ts:1-51

     50 lines  4 instances  dup:7dfe0100
    packages/baresync/src/server/__test__/drizzle.test.ts:337-386
    packages/baresync/src/server/__test__/drizzle.test.ts:452-501
    packages/baresync/src/server/__test__/drizzle.test.ts:514-563
    packages/baresync/src/server/__test__/drizzle.test.ts:578-627

     47 lines  2 instances  dup:bf9405e6
    packages/create-baresync/src/templates/server/src/v1/routes-elysia.ts:8-54
    packages/create-baresync/src/templates/server/src/v1/routes-hono.ts:8-54

     37 lines  2 instances  dup:d4e91ffe
    examples/inventory-json-polling/apps/server/src/v1/routes.ts:35-71
    packages/create-baresync/src/templates/server/src/v1/routes-hono.ts:26-62

     37 lines  2 instances  dup:a6efd263
    examples/inventory-json-polling/packages/sync-contract/generated/2026-06-01/local-synced-schema.ts:1-37
    examples/inventory-json-polling/packages/sync-contract/src/local-synced-schema.ts:1-37

     36 lines  2 instances  dup:be348aaa
    packages/baresync/src/generator/__test__/generator.test.ts:23-52
    packages/baresync/src/generator/__test__/manifest.test.ts:14-49

     28 lines  2 instances  dup:f349ef39
    packages/baresync/src/server/__test__/handlers.test.ts:11-38
    packages/baresync/src/server/__test__/server.test.ts:17-44

  ... and 70 more clone groups
  Identical code blocks detected via suffix-array analysis — https://docs.fallow.tools/explanations/duplication#clone-groups

● Clone families (11 with multiple groups)

  17 groups, 178 lines across packages/baresync/src/generator/__test__/diagnostics.test.ts
    → Extract 17 shared clone groups (178 lines) from diagnostics.test.ts into packages/baresync/src/generator/__test__

  2 groups, 34 lines across packages/baresync/src/generator/__test__/formatter.test.ts
    → Extract shared function (24 lines) from formatter.test.ts, formatter.test.ts
    → Extract shared function (10 lines) from formatter.test.ts, formatter.test.ts

  3 groups, 65 lines across packages/baresync/src/generator/__test__/generator.test.ts, packages/baresync/src/generator/__test__/manifest.test.ts
    → Extract 3 shared clone groups (65 lines) from generator.test.ts, manifest.test.ts into packages/baresync/src/generator/__test__

  2 groups, 28 lines across packages/baresync/src/generator/__test__/manifest.test.ts
    → Extract shared function (14 lines) from manifest.test.ts, manifest.test.ts
    → Extract shared function (14 lines) from manifest.test.ts, manifest.test.ts

  2 groups, 11 lines across packages/baresync/src/schema/__test__/schema.test.ts
    → Extract shared function (6 lines) from schema.test.ts, schema.test.ts
    → Extract shared function (5 lines) from schema.test.ts, schema.test.ts

  3 groups, 157 lines across packages/baresync/src/server/__test__/drizzle.test.ts
    → Extract 3 shared clone groups (157 lines) from drizzle.test.ts into packages/baresync/src/server/__test__

  3 groups, 62 lines across packages/baresync/src/server/__test__/server.test.ts, packages/baresync/src/server/__test__/simulation.test.ts
    → Extract 3 shared clone groups (62 lines) from server.test.ts, simulation.test.ts into packages/baresync/src/server/__test__

  2 groups, 22 lines across packages/baresync/src/tauri/__test__/client.test.ts
    → Extract shared function (11 lines) from client.test.ts, client.test.ts
    → Extract shared function (11 lines) from client.test.ts, client.test.ts, client.test.ts, client.test.ts, client.test.ts, client.test.ts, client.test.ts, client.test.ts, client.test.ts

  4 groups, 103 lines across tests/e2e/android/install-fixture.ts, tests/e2e/android/run-adb-smoke.ts
    → Extract 4 shared clone groups (103 lines) from install-fixture.ts, run-adb-smoke.ts into tests/e2e/android

  9 groups, 111 lines across tests/e2e/android/run-adb-smoke.ts, tests/e2e/android/run-smoke.ts
    → Extract 9 shared clone groups (111 lines) from run-adb-smoke.ts, run-smoke.ts into tests/e2e/android

  ... and 1 more families

  Groups of related clones across the same files — https://docs.fallow.tools/explanations/duplication#clone-families

■ Metrics: 33,371 LOC · dead files 17.8% · dead exports 15.3% · avg cyclomatic 1.7 · p90 cyclomatic 3 · maintainability 89.2 (good) · 0 churn hotspots (since 6 months) · 6 unused deps

  Function size: 67% low · 20% medium · 8% high · 5% very high  (1-15 / 16-30 / 31-60 / >60 LOC)

● Large functions (10 shown, 64 total)
  packages/baresync/src/generator/__test__/diagnostics.test.ts
    :92 <arrow>  554 lines
  packages/baresync/src/tauri/__test__/client.test.ts
    :26 <arrow>  477 lines
  packages/baresync/src/generator/__test__/config.test.ts
    :19 <arrow>  202 lines
  apps/docs/src/components/sync-slider.tsx
    :248 SyncSlider  198 lines
  packages/baresync/src/server/__test__/drizzle.test.ts
    :89 createRepository  196 lines
  examples/inventory-json-polling/apps/server/src/db/v1/drizzle-helper/sync-repository.ts
    :43 createInventorySyncRepository  194 lines
  examples/inventory-json-polling/apps/app/src/components/DataTable.tsx
    :27 DataTable  183 lines
  apps/docs/src/components/animated-beam.tsx
    :30 AnimatedBeam  164 lines
  packages/baresync/src/server/__test__/drizzle.test.ts
    :577 <arrow>  159 lines
    :578 <arrow>  157 lines
  Functions exceeding 60 lines of code (very high risk): https://docs.fallow.tools/explanations/health#unit-size
  use --top 64 to see all

● High complexity functions (43)
  CRAP scores are estimated from export references; run `fallow health --coverage <coverage-final.json>` for exact scores.
  packages/baresync/src/tauri/client.ts
    :111 createSyncClient
          22 cyclomatic   11 cognitive   82 lines
  packages/baresync/src/server/service.ts
    :358 mapSyncError
          17 cyclomatic   17 cognitive   47 lines
  examples/inventory-json-polling/apps/app/src/components/SyncPanel.tsx
    :63 SyncPanel CRITICAL
          15 cyclomatic   11 cognitive   88 lines
         240.0 CRAP
  packages/create-baresync/src/scaffold.ts
    :145 patchAppFiles CRITICAL
          14 cyclomatic    8 cognitive  123 lines
         210.0 CRAP
  apps/docs/src/components/sync-slider.tsx
    :131 CodeLine CRITICAL
          13 cyclomatic   14 cognitive  116 lines
         182.0 CRAP
  examples/inventory-json-polling/apps/app/src/components/DataTable.tsx
    :27 DataTable CRITICAL
          12 cyclomatic    6 cognitive  183 lines
         156.0 CRAP
  packages/baresync/src/cli/generator.ts
    :127 runGenerateCommand
          11 cyclomatic   17 cognitive   59 lines
  apps/docs/src/components/ui/background-ripple-effect.tsx
    :108 <arrow> CRITICAL
          11 cyclomatic    8 cognitive   42 lines
         132.0 CRAP
  tests/e2e/backend/fixture-server.ts
    :464 applyPush CRITICAL
          10 cyclomatic   19 cognitive   35 lines
         110.0 CRAP
  packages/baresync/src/cli/generator.ts
    :288 parseGenerateCliArgs
          10 cyclomatic   15 cognitive   40 lines
          31.6 CRAP
  packages/baresync/src/server/handlers.ts
    :133 getErrorStatus
          10 cyclomatic    3 cognitive   25 lines
          31.6 CRAP
  examples/inventory-json-polling/apps/server/src/db/v1/primitive/sync-repository.ts
    :78 writePushChange CRITICAL
          10 cyclomatic   13 cognitive  102 lines
         110.0 CRAP
  packages/baresync/src/generator/fk-order.ts
    :52 buildGraph
           9 cyclomatic   18 cognitive   47 lines
  tests/fixture-app/src/main.ts
    :103 refreshStatus HIGH
           9 cyclomatic    8 cognitive   53 lines
          90.0 CRAP
  packages/create-baresync/src/scaffold.ts
    :269 patchServerFiles HIGH
           9 cyclomatic    3 cognitive  111 lines
          90.0 CRAP
  packages/baresync/src/server/chunking.ts
    :7 getWriteChunkSize HIGH
           9 cyclomatic    8 cognitive   24 lines
          90.0 CRAP
  tests/e2e/backend/fixture-server.ts
    :167 rowToProduct HIGH
           8 cyclomatic    7 cognitive   13 lines
          72.0 CRAP
    :391 upsertProduct HIGH
           8 cyclomatic    7 cognitive   27 lines
          72.0 CRAP
    :536 handlePullRequest HIGH
           8 cyclomatic    8 cognitive   42 lines
          72.0 CRAP
  packages/create-baresync/src/scaffold.ts
    :66 deepMerge HIGH
           8 cyclomatic    4 cognitive   27 lines
          72.0 CRAP
  apps/docs/src/components/sync-slider.tsx
    :350 <arrow> HIGH
           8 cyclomatic    7 cognitive   64 lines
          72.0 CRAP
  tests/e2e/desktop/webdriverio.conf.ts
    :114 onPrepare HIGH
           7 cyclomatic    4 cognitive   73 lines
          56.0 CRAP
  packages/baresync/src/cli/skills.ts
    :15 parseSkillsFlags HIGH
           7 cyclomatic    9 cognitive   19 lines
          56.0 CRAP
  tests/e2e/backend/fixture-server.ts
    :154 rowToCategory HIGH
           7 cyclomatic    6 cognitive   12 lines
          56.0 CRAP
    :239 latest HIGH
           7 cyclomatic    6 cognitive   26 lines
          56.0 CRAP
    :365 upsertCategory HIGH
           7 cyclomatic    6 cognitive   25 lines
          56.0 CRAP
  tests/e2e/android/run-adb-smoke.ts
    :236 tapText
           6 cyclomatic    8 cognitive   26 lines
          42.0 CRAP
  apps/docs/src/routes/index.tsx
    :54 getCellFromEvent
           6 cyclomatic    3 cognitive   17 lines
          42.0 CRAP
  packages/baresync/src/cli/skills.ts
    :92 runSkillsCommand
           6 cyclomatic    4 cognitive   26 lines
          42.0 CRAP
  examples/inventory-json-polling/apps/app/src/components/DataTable.tsx
    :66 <arrow>
           6 cyclomatic    5 cognitive   17 lines
          42.0 CRAP
  examples/inventory-json-polling/apps/app/src/hooks/useSyncState.ts
    :23 useSyncState
           5 cyclomatic    2 cognitive   22 lines
          30.0 CRAP
  tests/e2e/android/install-fixture.ts
    :148 mapAbiToTauriTarget
           5 cyclomatic    4 cognitive   15 lines
          30.0 CRAP
    :213 ensureReleaseSigning
           5 cyclomatic    4 cognitive   38 lines
          30.0 CRAP
  tests/e2e/android/run-adb-smoke.ts
    :149 waitForBackendPush
           5 cyclomatic    6 cognitive   36 lines
          30.0 CRAP
    :186 dumpUi
           5 cyclomatic    4 cognitive   23 lines
          30.0 CRAP
  tests/e2e/android/run-smoke.ts
    :197 waitForBackendPush
           5 cyclomatic    6 cognitive   37 lines
          30.0 CRAP
  examples/inventory-json-polling/apps/app/src/components/SeedPanel.tsx
    :9 getNextSampleIndex
           5 cyclomatic    4 cognitive   23 lines
          30.0 CRAP
  apps/docs/src/lib/source.ts
    :14 markdownPathToSlugs
           5 cyclomatic    4 cognitive   15 lines
          30.0 CRAP
  packages/baresync/src/cli/skills.ts
    :58 runSkillsUpdate
           5 cyclomatic    5 cognitive   33 lines
          30.0 CRAP
  examples/inventory-json-polling/apps/server/src/db/v1/primitive/utils.ts
    :189 readLatestCursorRow
           5 cyclomatic    4 cognitive   73 lines
          30.0 CRAP
  tests/e2e/backend/fixture-server.ts
    :517 handleStatusRequest
           5 cyclomatic    4 cognitive   18 lines
          30.0 CRAP
  packages/create-baresync/src/scaffold.ts
    :381 scaffoldProject
           5 cyclomatic    4 cognitive   94 lines
          30.0 CRAP
  apps/docs/src/components/wave-background.tsx
    :120 frameId
           5 cyclomatic    4 cognitive    9 lines
          30.0 CRAP
  Functions exceeding cyclomatic, cognitive, or CRAP thresholds (https://docs.fallow.tools/explanations/health#complexity-metrics)
  To suppress: // fallow-ignore-next-line complexity

● File health scores (129 files) · sorted by triage concern

   68.5    examples/inventory-json-polling/apps/app/src/components/SyncPanel.tsx  risk
            162 LOC    1 fan-in    3 fan-out  100% dead  0.20 density  240.0 risk

   89.7    packages/create-baresync/src/scaffold.ts        risk
            475 LOC    2 fan-in    4 fan-out    0% dead  0.13 density  210.0 risk

   93.9    apps/docs/src/components/sync-slider.tsx        risk
            446 LOC    1 fan-in    1 fan-out    0% dead  0.11 density  182.0 risk

   70.0    examples/inventory-json-polling/apps/app/src/components/DataTable.tsx  risk
            210 LOC    3 fan-in    1 fan-out  100% dead  0.24 density  156.0 risk

   92.4    apps/docs/src/components/ui/background-ripple-effect.tsx  risk
            153 LOC    1 fan-in    1 fan-out    0% dead  0.16 density  132.0 risk

   71.2    examples/inventory-json-polling/apps/server/src/db/v1/primitive/sync-repository.ts  risk
            262 LOC    0 fan-in    4 fan-out  100% dead  0.08 density  110.0 risk

   88.8    tests/e2e/backend/fixture-server.ts             risk
            666 LOC    0 fan-in    3 fan-out    0% dead  0.19 density  110.0 risk

   89.5    packages/baresync/src/server/chunking.ts        risk
             43 LOC    1 fan-in    0 fan-out   14% dead  0.30 density  90.0 risk

   91.7    tests/fixture-app/src/main.ts                   risk
            328 LOC    1 fan-in    2 fan-out    0% dead  0.13 density  90.0 risk

   91.8    packages/baresync/src/cli/skills.ts             risk
            118 LOC    1 fan-in    1 fan-out    0% dead  0.18 density  56.0 risk

  ... and 119 more files (--format json for full list)

  Sorted by triage concern: the larger of low-MI concern and CRAP risk. The risk / structure tag marks which one placed each file. MI reflects complexity, coupling, and dead code; risk reflects untested complexity (CRAP) and can diverge from MI. Risk: low <15, moderate 15-30, high >=30. CRAP estimated from export references (85% direct, 40% indirect, 0% untested). Run `fallow health --coverage <coverage-final.json>` for exact scores. https://docs.fallow.tools/explanations/health#file-health-scores

● Hotspots (59 files, since 6 months)

   40.1 ▼  packages/baresync/src/server/service.ts
          10 commits    640 churn  0.22 density   7 fan-in  ▼ cooling

   35.6 ▼  packages/baresync/src/generator/index.ts
          12 commits    379 churn  0.16 density   9 fan-in  ▼ cooling

   31.9 ─  tests/e2e/backend/fixture-server.ts
           9 commits   1045 churn  0.19 density   0 fan-in  ─ stable

   27.8 ─  packages/baresync/src/tauri/client.ts
           7 commits    218 churn  0.21 density   2 fan-in  ─ stable

   26.7 ▼  packages/create-baresync/src/__test__/integration-templates.test.ts [test]
           4 commits    102 churn  0.34 density   0 fan-in  ▼ cooling

   24.0 ▼  packages/baresync/src/db/drizzle-proxy.ts
           5 commits    103 churn  0.26 density   2 fan-in  ▼ cooling

   23.2 ▲  examples/inventory-json-polling/apps/app/src/hooks/useBaresyncQuery.tsx
           6 commits    146 churn  0.20 density   5 fan-in  ▲ accelerating

   19.9 ─  packages/baresync/src/generator/config.ts
           7 commits    420 churn  0.15 density   3 fan-in  ─ stable

   17.8 ▼  packages/baresync/src/tauri/__test__/client.test.ts [test]
           8 commits    646 churn  0.12 density   0 fan-in  ▼ cooling

   17.7 ▼  packages/create-baresync/src/templates.ts
           6 commits    392 churn  0.15 density   7 fan-in  ▼ cooling

   17.0 ─  packages/baresync/src/schema/contract.ts
           5 commits    141 churn  0.18 density  12 fan-in  ─ stable

   17.0 ─  packages/baresync/src/schema/__test__/schema.test.ts [test]
           7 commits    342 churn  0.13 density   0 fan-in  ─ stable

   15.3 ▼  packages/create-baresync/src/scaffold.ts
           6 commits    798 churn  0.13 density   2 fan-in  ▼ cooling

   15.1 ▲  examples/inventory-json-polling/apps/server/src/index.ts
           6 commits    175 churn  0.13 density   0 fan-in  ▲ accelerating

   14.9 ▼  packages/baresync/src/generator/diagnostics.ts
           5 commits    864 churn  0.16 density   4 fan-in  ▼ cooling

   14.7 ▲  apps/docs/src/routes/index.tsx
          15 commits   1450 churn  0.05 density   1 fan-in  ▲ accelerating

   13.6 ─  apps/docs/src/components/mdx/mermaid.tsx
           4 commits    142 churn  0.18 density   1 fan-in  ─ stable

   12.7 ▼  apps/docs/src/components/ui/background-ripple-effect.tsx
           4 commits    168 churn  0.16 density   1 fan-in  ▼ cooling

   12.3 ─  tests/fixture-app/src/main.ts
           5 commits    349 churn  0.13 density   1 fan-in  ─ stable

   12.0 ▼  packages/baresync/src/db/__test__/drizzle-proxy.test.ts [test]
           5 commits    191 churn  0.13 density   0 fan-in  ▼ cooling

   11.0 ▼  packages/create-baresync/src/__test__/templates.test.ts [test]
           4 commits    108 churn  0.14 density   0 fan-in  ▼ cooling

   10.9 ─  apps/docs/src/components/sync-slider.tsx
           5 commits    669 churn  0.11 density   1 fan-in  ─ stable

   10.3 ▼  tests/e2e/desktop/webdriverio.conf.ts
           4 commits    215 churn  0.14 density   0 fan-in  ▼ cooling

   10.1 ▼  apps/docs/src/start.ts
           3 commits     51 churn  0.18 density   1 fan-in  ▼ cooling

    9.2 ▲  packages/baresync/src/generator/__test__/diagnostics.test.ts [test]
           4 commits   1010 churn  0.12 density   0 fan-in  ▲ accelerating

    9.0 ─  packages/baresync/src/generator/outputs.ts
           6 commits    300 churn  0.08 density   1 fan-in  ─ stable

    8.7 ▲  apps/docs/src/lib/source.ts
           3 commits     76 churn  0.16 density   6 fan-in  ▲ accelerating

    8.5 ▲  examples/inventory-json-polling/apps/app/src/components/SeedPanel.tsx
           4 commits    171 churn  0.11 density   1 fan-in  ▲ accelerating

    8.2 ▼  packages/baresync/src/server/__test__/server.test.ts [test]
           5 commits    526 churn  0.09 density   0 fan-in  ▼ cooling

    7.9 ─  packages/baresync/src/generator/__test__/generator.test.ts [test]
           7 commits    548 churn  0.06 density   0 fan-in  ─ stable

    7.7 ▼  packages/create-baresync/src/templates/server/src/v1/routes-elysia.ts
           3 commits     73 churn  0.13 density   0 fan-in  ▼ cooling

    7.7 ▼  packages/create-baresync/src/templates/server/src/v1/routes-hono.ts
           3 commits     76 churn  0.13 density   0 fan-in  ▼ cooling

    7.7 ▲  packages/baresync/src/generator/__test__/config.test.ts [test]
           8 commits   1008 churn  0.05 density   0 fan-in  ▲ accelerating

    7.5 ─  tests/e2e/android/install-fixture.ts
           4 commits    437 churn  0.10 density   0 fan-in  ─ stable

    6.5 ▼  examples/inventory-json-polling/apps/server/src/db/v1/drizzle-helper/sync-repository.ts
           3 commits    240 churn  0.11 density   1 fan-in  ▼ cooling

    6.5 ▼  examples/inventory-json-polling/apps/server/src/v1/routes.ts
           3 commits    175 churn  0.11 density   1 fan-in  ▼ cooling

    6.4 ▼  tests/e2e/desktop/sync-smoke.test.ts [test]
           5 commits    247 churn  0.07 density   0 fan-in  ▼ cooling

    6.3 ▼  packages/create-baresync/src/templates/app/sync-client.ts
           4 commits     19 churn  0.08 density   0 fan-in  ▼ cooling

    6.1 ▼  packages/baresync/src/server/__test__/simulation.test.ts [test]
           3 commits    474 churn  0.11 density   0 fan-in  ▼ cooling

    6.0 ─  tests/e2e/android/run-smoke.ts
           4 commits    375 churn  0.08 density   0 fan-in  ─ stable

    5.9 ▼  examples/inventory-json-polling/apps/server/src/db/v1/primitive/utils.ts
           3 commits    299 churn  0.10 density   1 fan-in  ▼ cooling

    5.8 ▲  examples/inventory-json-polling/apps/server/src/db/seed.ts
           5 commits    101 churn  0.06 density   1 fan-in  ▲ accelerating

    5.7 ─  apps/docs/src/components/mdx.tsx
           6 commits     47 churn  0.05 density   1 fan-in  ─ stable

    5.3 ─  packages/baresync/src/generator/manifest.ts
           4 commits     83 churn  0.07 density   2 fan-in  ─ stable

    5.1 ▲  packages/baresync/src/server/__test__/handlers.test.ts [test]
           3 commits    659 churn  0.09 density   0 fan-in  ▲ accelerating

    4.7 ▼  examples/inventory-json-polling/apps/server/src/db/v1/primitive/sync-repository.ts
           3 commits    265 churn  0.08 density   0 fan-in  ▼ cooling

    4.7 ▲  packages/create-baresync/src/templates/server/src/index-elysia.ts
           3 commits     48 churn  0.08 density   0 fan-in  ▲ accelerating

    4.6 ▲  packages/baresync/src/server/handlers.ts
           3 commits    442 churn  0.08 density   3 fan-in  ▲ accelerating

    4.1 ▼  packages/create-baresync/src/templates/server/src/index-hono.ts
           3 commits     41 churn  0.07 density   0 fan-in  ▼ cooling

    4.0 ▲  packages/baresync/src/server/drizzle.ts
           3 commits    482 churn  0.07 density   3 fan-in  ▲ accelerating

    3.8 ─  packages/baresync/src/generator/__test__/manifest.test.ts [test]
           4 commits    180 churn  0.05 density   0 fan-in  ─ stable

    3.6 ▲  apps/docs/src/components/animated-beam.tsx
           3 commits    533 churn  0.06 density   1 fan-in  ▲ accelerating

    3.2 ▼  apps/docs/src/components/aurora-background.tsx
           4 commits    553 churn  0.04 density   1 fan-in  ▼ cooling

    3.2 ▼  apps/docs/src/components/mdx/pm-command-block.tsx
           4 commits    219 churn  0.04 density   2 fan-in  ▼ cooling

    2.8 ▼  tests/fixture-app/src/fixture-schema.ts
           5 commits    158 churn  0.03 density   1 fan-in  ▼ cooling

    2.7 ▼  packages/baresync/src/schema/server-schema.ts
           3 commits    104 churn  0.05 density   5 fan-in  ▼ cooling

    2.6 ─  apps/docs/src/routes/__root.tsx
           7 commits    156 churn  0.02 density   1 fan-in  ─ stable

    2.3 ▲  apps/docs/src/lib/layout.shared.tsx
           3 commits     34 churn  0.04 density   3 fan-in  ▲ accelerating

    0.8 ─  apps/docs/src/components/sync-visualization.tsx
           4 commits    454 churn  0.01 density   1 fan-in  ─ stable

  70 files excluded (< 3 commits)

  Files with high churn and high complexity — https://docs.fallow.tools/explanations/health#hotspot-metrics

● Refactoring targets (8)
  8 medium
    score = quick-win ROI (higher = better) · pri = absolute priority

   23.4  pri:46.8    examples/inventory-json-polling/apps/app/src/hooks/useBaresyncQuery.tsx
         dead code · effort:medium · confidence:high  Remove 3 unused exports to reduce surface area (100% dead)

   15.9  pri:31.8    examples/inventory-json-polling/packages/sync-contract/generated/2026-06-01/api-synced-schema.ts
         dead code · effort:medium · confidence:high  Remove 3 unused exports to reduce surface area (100% dead)

   14.8  pri:29.5    examples/inventory-json-polling/apps/server/src/db/seed.ts
         dead code · effort:medium · confidence:high  Remove 3 unused exports to reduce surface area (100% dead)

   14.8  pri:29.5    examples/inventory-json-polling/apps/server/src/db/v1/primitive/utils.ts
         dead code · effort:medium · confidence:high  Remove 13 unused exports to reduce surface area (100% dead)

   13.6  pri:27.1    examples/inventory-json-polling/packages/sync-contract/src/local-synced-schema.ts
         dead code · effort:medium · confidence:high  Remove 3 unused exports to reduce surface area (100% dead)

   13.4  pri:26.8    examples/inventory-json-polling/packages/sync-contract/src/api-synced-schema.ts
         dead code · effort:medium · confidence:high  Remove 3 unused exports to reduce surface area (100% dead)

   12.3  pri:24.6    examples/inventory-json-polling/packages/sync-contract/generated/2026-06-01/local-synced-schema.ts
         dead code · effort:medium · confidence:high  Remove 3 unused exports to reduce surface area (100% dead)

    7.8  pri:15.5    tests/fixture-app/src/fixture-schema.ts
         dead code · effort:medium · confidence:high  Remove 8 unused exports to reduce surface area (57% dead)

  Prioritized refactoring recommendations based on complexity, churn, and coupling signals — https://docs.fallow.tools/explanations/health#refactoring-targets

