## Context

Baresync's sync-contract package currently requires `packageName` in `defineSyncConfig` — a remnant from protobuf encoding (now experimental/dropped). The generated output goes to a flat `generated/` directory with an integer `contractVersion`. Constants like `INVENTORY_SCOPE_ID` and `INVENTORY_PACKAGE_NAME` live in `constants.ts` within the sync-contract package, coupling schema definition to runtime values and domain-specific naming.

The generator writes to: `generated/sync-contract.json`, `generated/sync-contract.manifest.json`, `generated/sync-table-order.ts`.

The inventory example's `sync.config.ts` imports `INVENTORY_PACKAGE_NAME` from `constants.ts` to satisfy the `packageName` requirement.

The server (`apps/server/src/index.ts`) imports `SYNC_UPSERT_ORDER` from the generated output and drizzle schema tables from `api-synced-schema` for DB queries. Both are version-specific.

## Goals / Non-Goals

**Goals:**
- Remove `packageName` from `defineSyncConfig` — contract identity is the output directory path
- Replace integer `contractVersion` with ISO date string (`YYYY-MM-DD`)
- Generate output into dated subdirectories (`generated/2026-06-01/`) with frozen schema snapshots
- Snapshot drizzle schema source files into the generated directory alongside contract artifacts
- Rename `INVENTORY_SCOPE_ID` → `SYNC_SCOPE`, remove `INVENTORY_PACKAGE_NAME`
- Keep `SYNC_SCOPE` in sync-contract's `constants.ts` for monorepo convenience
- Reorganize inventory example server into versioned route/repository structure

**Non-Goals:**
- Multi-version contract negotiation (client/server version matching) — versioned API paths make this unnecessary
- Protobuf encoding support — already dropped
- Auto-migration of schemas between versions — user manages DB migrations with drizzle-kit
- Migrating old generated output — users regenerate from scratch

## Decisions

### 1. Contract identity = output directory path

**Decision:** Remove `packageName` entirely. The contract is identified by its location in the filesystem (`generated/2026-06-01/`).

**Why:** No remaining consumer of `packageName`. JSON encoding doesn't need a namespace. The directory path is unique and human-readable.

**Alternative considered:** Auto-derive from `package.json` name — adds coupling to package metadata for no benefit.

### 2. ISO date as contract version

**Decision:** `contractVersion` becomes a date string like `"2026-06-01"` (generation date, not schema hash).

**Why:** Human-readable, no state tracking needed (no reading previous manifest to increment), no merge conflicts. Same schema regenerated same day = same version (acceptable — identical schema, identical contract).

**Alternative considered:** Content hash — deterministic but not human-readable. Would need to explain `a3f2b1c` in API routes.

### 3. Dated subdirectory output with schema snapshots

**Decision:** Generator writes to `generated/<YYYY-MM-DD>/` and snapshots the drizzle schema source files into the same directory alongside contract artifacts.

**Why:** Multi-version coexistence requires frozen schemas per version. When a column is renamed in the live `src/` schema, v1's generated directory still has the old schema — v1's server handlers compile correctly against the frozen copy. The user never manually copies schemas — the generator does it.

**Alternative considered (Option 2):** Per-version source directories (`src/v1/`, `src/v2/`). Rejected because it requires the user to manually duplicate schemas, introduces editable "frozen" files, and is harder to teach. One source of truth (`src/`) with automatic snapshotting is simpler.

Generated directory structure:

```
packages/sync-contract/
  src/
    api-synced-schema.ts       ← THE source, always current
    local-synced-schema.ts     ← THE source, always current
    api-schema.ts              ← shared infra (not versioned)
    local-schema.ts            ← shared infra (not versioned)
    constants.ts               ← SYNC_SCOPE
  sync.config.ts               ← one config
  generated/
    2026-05-15/                ← frozen snapshot
      sync-contract.json
      sync-contract.manifest.json
      sync-table-order.ts
      api-synced-schema.ts     ← frozen copy of schema source
      local-synced-schema.ts   ← frozen copy of schema source
    2026-06-01/                ← frozen snapshot
      ...
```

### 4. `SYNC_SCOPE` stays in sync-contract `constants.ts`

**Decision:** Keep a `constants.ts` in sync-contract with only `export const SYNC_SCOPE = "default"`.

**Why:** Both app and server need this value. The monorepo workspace makes importing trivial. It's not a schema concern, but it's a shared runtime concern that benefits from a single source of truth.

**Alternative considered:** Move to app code only — server would need to duplicate the value or import from app (wrong direction).

### 5. `outputDir` in config becomes the parent of dated directories

**Decision:** `outputDir: "./generated"` means generated artifacts go to `./generated/2026-06-01/`. The `outputDir` is no longer the direct output location but the parent directory for versioned outputs.

**Why:** Keeps the config simple — user sets one `outputDir` and versions are managed automatically. The generator creates a dated subdirectory on each run.

### 6. Versioned server organization

**Decision:** The inventory example server organizes route handlers and sync repositories by version. Each version imports from its matching generated directory (both contract artifacts and frozen schemas).

```
apps/server/src/
  db/
    client.ts                  ← shared (version-independent)
    v1/
      sync-repository.ts       ← imports from generated/2026-05-15/
    v2/
      sync-repository.ts       ← imports from generated/2026-06-01/
  v1/
    routes.ts                  ← createSyncPushHandler etc. with v1 contract
  v2/
    routes.ts                  ← createSyncPushHandler etc. with v2 contract
  index.ts                     ← registers /api/v1/* and /api/v2/* routes
```

**Why:** When a column changes, v1's handlers still compile against v1's frozen schema in `generated/2026-05-15/`. Dropping v1 = delete the v1 directories + remove route registration.

## Risks / Trade-offs

- **Same-day regeneration overwrites** → If user generates twice on the same day, the second run overwrites the first. This is acceptable — same day, same schema intent. If they need distinct same-day versions, they can manually rename the directory.
- **Import path changes on version bump** → App and server imports change from `../generated/2026-05-15/` to `../generated/2026-06-01/`. This is intentional — it forces the user to acknowledge the version change.
- **No backward compatibility for existing generated output** → Users with flat `generated/` must regenerate. No migration path needed — just delete and regenerate.
- **`outputDir` semantics change** → Breaking change for `defineSyncConfig` consumers. The `outputDir` now creates a subdirectory instead of writing directly. Acceptable for pre-1.0.
- **Frozen schema snapshots are disconnected from source** → If a contributor edits `src/api-synced-schema.ts`, it doesn't affect existing generated snapshots (which is the point). But they might not realize they need to regenerate.
- **Server version directories grow over time** → Each schema change adds a new version directory. Acceptable — dropping old versions is a simple delete.
