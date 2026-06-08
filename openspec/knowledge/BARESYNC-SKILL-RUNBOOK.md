# Baresync Sync Runbook

This runbook keeps two things in sync with the source code:
- **Web docs** (`apps/docs/content/docs/`) — human-facing documentation
- **AI skill bootstrap** (`packages/baresync/skills/baresync/SKILL.md`) — npm-packaged routing guidance for coding agents
- **Hosted AI references** (`apps/docs/public/skills/baresync/<version>/reference/`) — detailed versioned knowledge for coding agents

Source code is the ultimate truth. When source changes, web docs and hosted skill references must follow. The packaged bootstrap skill should change only when routing, version detection, or fallback behavior changes.

## Three-way sync

```
Source Code ──────→ Hosted References (verify & fix)
     │                         │
     │                         ↓
     └──────────────→ Web Docs (update)
                               │
                               ↓
                    Bootstrap Skill (routing only)
```

**Direction 1: Source code → Hosted References → Docs**
Use when source code changed. Verify hosted references against source, fix discrepancies, then update docs to match.

**Direction 2: Docs → Hosted References**
Use when docs changed (new content, corrections, additions). Read docs, compress into hosted skill references for the supported version lines.

**Direction 3: Full verification**
Periodically run both directions to catch drift.

## File structure

```
packages/baresync/skills/baresync/
  SKILL.md                        # npm-packaged bootstrap: version detection, routing, fallback rules

apps/docs/public/skills/baresync/<version>/
  manifest.json                   # version metadata + reference URL map
  reference/
    setup.md                      # greenfield + brownfield integration guide
    write.md                      # local writes, outbox, transactions, coalescing
    server.md                     # routes, sync repository, scope resolution
    schema.md                     # add/modify synced tables, FK/PK rules, column details
    debug.md                      # troubleshooting, GC, outbox purging, diagnostics
    query.md                      # conceptual Q&A, sync modes, resync guidance
    ui-frameworks.md              # React, Solid, framework-agnostic wiring
    internals.md                  # deep engine details (status flow, chunking, runtime tables)
    generator.md                  # sync config, CLI flags, generated files, diagnostics
    tauri-plugin.md               # plugin builder, commands, polling, events, migrations
    testing.md                    # testing layers, mock patterns, E2E debugging
    production.md                 # environment config, monitoring, performance, resets

apps/docs/content/docs/
  getting-started/                # → setup.md
  ui-frameworks/                  # → ui-frameworks.md
  sync-engine/                    # → internals.md, query.md, debug.md
  schema/                         # → schema.md, debug.md, internals.md
  generator/                      # → generator.md
  tauri-plugin/                   # → tauri-plugin.md
  js-client/                      # → ui-frameworks.md, query.md, debug.md
  local-database/                 # → write.md, setup.md, debug.md, query.md
  server/                         # → server.md, debug.md, internals.md
  testing/                        # → testing.md
  running-in-production/          # → production.md, setup.md, schema.md, ui-frameworks.md
  reference/                      # → debug.md, generator.md, SKILL.md, internals.md
  concepts.mdx                    # → SKILL.md concepts (already covered)
  architecture.mdx                # → SKILL.md concepts (already covered)
```

## Direction 1: Source code → Hosted References → Docs

Use when source code changed. This is the primary verification path.

### Step 1: Verify hosted references against source code

Run parallel subagents. Each reads skill file(s) AND source code, returns discrepancies.

**Each subagent must:**
1. Read the specified hosted reference file(s)
2. Read the specified source code files
3. Compare every claim in the skill against the source
4. Return a structured list of discrepancies: `[DISCREPANCY] reference file:line — "reference says X" → source says "Y" (source file:line)`
5. Return `[MATCH]` if everything matches

**Batch structure (run in parallel):**

| Batch | Agent | Skill files | Source code | What to compare |
|---|---|---|---|---|
| 1A | A | `setup.md` + `write.md` + `server.md` | `packages/baresync/src/` | Function names, params, types, export paths |
| 1B | B | `ui-frameworks.md` + `query.md` | `packages/baresync/src/` | SyncClient methods, Drizzle proxy, events |
| 2A | C | `tauri-plugin.md` | `crates/tauri-plugin-baresync/src/` | Builder methods, commands, polling, migrations |
| 2B | D | `internals.md` + `debug.md` | `crates/baresync-core/src/` | SyncError variants, chunking constants, engine logic |
| 3 | E | `generator.md` + `schema.md` | Generator source (`packages/baresync/src/generator/`) | CLI flags, config params, diagnostic codes, output structure |
| 4 | F | `SKILL.md` | Findings from agents A-E | Glossary accuracy, essential pieces completeness |

### Step 2: Fix skill discrepancies

For each discrepancy found:
1. Verify the agent's finding is correct (read the source file yourself if unsure)
2. Fix the skill file to match the source code
3. Check other skill files for the same claim (e.g., outbox upsert claim appeared in 4 files)

### Step 3: Update web docs to match

After fixing skills from source, the docs may also be wrong. Use the routing table above to find which docs correspond to the changed skill files. Read the relevant doc pages and update them to match the source code.

For example, if `server.md` was wrong about callback signatures:
- The routing table says `server/` docs → `server.md`
- Read `apps/docs/content/docs/server/push-handler.mdx`, `pull-handler.mdx`, `status-handler.mdx`
- Update the callback signatures in those docs to match the source code

### Step 4: Verify SKILL.md

Check SKILL.md for:
- Glossary terms use correct names (snake_case for SQLite columns, camelCase for JS properties)
- Essential pieces table mentions all required fields (e.g., `idempotency` on push handler)
- No phantom references to removed/renamed params

### Step 5: Run lint and update changelog

```bash
bun x ultracite check
```

Record in changelog: what was found, what was fixed, which files changed.

## Direction 2: Docs → Skills

Use when docs changed (new pages, corrections, additions, rewrites). This is the knowledge compression path.

**CRITICAL: Each step specifies exactly which docs to read and which skill files to update. Do not guess. If a docs section is not listed, do not read it. If a skill file is not listed as a target, do not write to it.**

### Step 1: Read getting-started docs → update setup.md

Read ALL files in `apps/docs/content/docs/getting-started/`.

Update `reference/setup.md` only. Compare each doc section against setup.md steps. Add missing details, fix outdated snippets, update paths.

### Step 2: Read ui-frameworks docs → update ui-frameworks.md

Read ALL files in `apps/docs/content/docs/ui-frameworks/`.

Update `reference/ui-frameworks.md` only. Compare React section, Solid section, framework-agnostic patterns. Add missing patterns, fix outdated code.

### Step 3: Read sync-engine docs → update internals.md, query.md, debug.md

Read ALL files in `apps/docs/content/docs/sync-engine/`.

For each doc, route knowledge to the correct skill file:
- Status flow, push envelope, pull SQL, chunking, runtime tables → `reference/internals.md`
- Sync modes, sync_full_resync vs sync_now → `reference/query.md`
- GC, outbox purging, cleanup → `reference/debug.md`
- Push coalescing, local-only columns stripped → `reference/write.md`

If knowledge doesn't fit any existing reference, ask: "does this deserve its own reference file?" If yes, create it and add a command to SKILL.md routing table.

### Step 4: Read schema docs → update schema.md, debug.md, internals.md

Read ALL files in `apps/docs/content/docs/schema/`.

Route knowledge:
- Synced tables, paired schemas, PK/FK rules, column details → `reference/schema.md`
- Diagnostics, error codes, warning codes → `reference/debug.md`
- Runtime table column definitions → `reference/internals.md`

### Step 5: Read generator docs → update generator.md

Read ALL files in `apps/docs/content/docs/generator/`.

Update `reference/generator.md` only. Compare config params, CLI flags, generated file structure, diagnostics.

### Step 6: Read tauri-plugin docs → update tauri-plugin.md

Read ALL files in `apps/docs/content/docs/tauri-plugin/`.

Update `reference/tauri-plugin.md` only. Compare builder methods, commands, polling lifecycle, events, migrations, host testing.

### Step 7: Read js-client docs → update ui-frameworks.md, query.md, debug.md

Read ALL files in `apps/docs/content/docs/js-client/`.

Route knowledge:
- SyncClient interface, methods, createSyncClient → `reference/ui-frameworks.md`
- Sync commands, push/pull/syncNow/fullResync comparison → `reference/query.md`
- Error handling, mock testing → `reference/debug.md`
- Local write helpers, bulk mutations → `reference/write.md`

### Step 8: Read local-database docs → update write.md, setup.md, debug.md, query.md

Read ALL files in `apps/docs/content/docs/local-database/`.

Route knowledge:
- Transactions, db.batch, atomicity → `reference/write.md`
- createTauriDrizzleDatabase config, encryption → `reference/setup.md`
- getDbInfo, debugging → `reference/debug.md`
- Read-after-write consistency → `reference/query.md`

### Step 9: Read server docs → update server.md, debug.md, internals.md

Read ALL files in `apps/docs/content/docs/server/`.

Route knowledge:
- Route handlers, sync repository, scope resolution, context, error mapping → `reference/server.md`
- Server error codes → `reference/debug.md`
- Server-side chunking helpers → `reference/internals.md`

### Step 10: Read testing docs → update testing.md

Read ALL files in `apps/docs/content/docs/testing/`.

Update `reference/testing.md` only. Compare testing layers, mock patterns, frontend/localDB/server/smoke tests, E2E debugging.

### Step 11: Read running-in-production docs → update production.md, setup.md, schema.md, ui-frameworks.md

Read ALL files in `apps/docs/content/docs/running-in-production/`.

Route knowledge:
- Environment config, SQLite settings, health monitoring, performance, resets → `reference/production.md`
- Environment-specific builder settings → `reference/setup.md`
- Schema changes impact → `reference/schema.md`
- Sync status indicator → `reference/ui-frameworks.md`

### Step 12: Read reference docs → update debug.md, generator.md, SKILL.md, internals.md

Read ALL files in `apps/docs/content/docs/reference/`.

Route knowledge:
- TypeScript API → `reference/ui-frameworks.md`, `reference/write.md` (verify method signatures)
- Rust API → `reference/tauri-plugin.md`, `reference/internals.md` (verify type signatures)
- Generated artifacts → `reference/generator.md` (verify output structure)
- Commands → `reference/tauri-plugin.md` (verify command list)
- Events → `reference/ui-frameworks.md` (verify event names)
- Errors → `reference/debug.md` (verify error codes, SyncError variants)
- Glossary → `SKILL.md` glossary (verify/update terms)

### Step 13: Update SKILL.md essentials and bans

Check if essential pieces table needs updates:
- New infrastructure tables? → add to essential pieces
- Changed column helpers? → update paired schemas description
- New generated outputs? → update sync contract description
- Changed plugin config? → update plugin config description

Check if bans are outdated:
- Is `writeTransaction` + `writeLocalChange` still the only correct write path?
- Is soft delete still the only correct delete pattern?
- Are there new imports that should never be used from generated files?

### Step 14: Verify against source code

After updating skills from docs, run Direction 1 (source code verification) to confirm everything matches. Docs can be wrong — source code is the final authority.

### Step 15: Run lint and update changelog

```bash
bun x ultracite check
```

Record in changelog: which docs were read, what was found, which skill files were changed.

## Direction 3: Full verification

Run periodically (e.g., monthly, or before a release).

1. Run Direction 1 Step 1 (source code verification) — find all discrepancies
2. Fix skills
3. Run Direction 1 Step 3 (update docs)
4. Run Direction 2 (docs → skills) — catch anything docs added that skills missed
5. Run Direction 1 Step 1 again — confirm zero discrepancies
