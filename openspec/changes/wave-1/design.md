## Context

The baresync project extracts Sakti POS's sync layer into a public, reusable
Tauri plugin. The source code lives in `docs/external/sakti-pos/` as a frozen
reference copy of the Sakti monorepo. The baresync workspace itself currently
contains only `docs/`, `openspec/`, and config directories — no packages, no
crates, no source code.

Wave 1 creates the compilable skeleton that Wave 2 extraction streams will fill.
The Sakti monorepo uses Bun workspaces (`"workspaces": ["apps/*", "packages/*"]`)
and has no root Cargo workspace — the POS app crate stands alone at
`apps/pos-app/src-tauri/Cargo.toml`. The baresync workspace needs its own
package and crate structure, independent from the Sakti repo.

The source monorepo's relevant dependency versions:
- `sqlx` 0.8.6 with SQLite + tokio runtime
- `reqwest` 0.12 with rustls-tls
- `prost` 0.13
- `tauri` 2
- `drizzle-orm` ^0.45.2
- `serde`/`serde_json` 1

## Goals / Non-Goals

**Goals:**

- Verify `baresync`, `baresync-core`, and `tauri-plugin-baresync` names are
  available on npm and Cargo before creating any files that embed those names.
- Create a `packages/baresync` Bun workspace package with all subpath exports
  from the PRD (`./schema`, `./generator`, `./db`, `./server`, `./tauri`,
  `./limits`), plus the `baresync` CLI binary entry point.
- Create `crates/baresync-core` and `crates/tauri-plugin-baresync` as compiling
  Rust crates in a root Cargo workspace.
- Export the four sync limit constants from `limits.ts` so Wave 2 can import
  them immediately.
- Add empty DB module stubs in both JS and Rust so later phases have stable
  import paths without path renames.
- Record the Sakti POS test baseline for regression detection during extraction.

**Non-Goals:**

- Moving any sync behavior or logic from Sakti into baresync.
- Publishing packages to npm or crates.io.
- Setting up CI, release automation, or Turborepo pipeline configuration.
- Creating the `baresync-generated` optional crate.
- Adding tests beyond compilation checks.

## Decisions

### D1: Root Cargo workspace at baresync repo root

The PRD calls for a root `Cargo.toml` workspace. This workspace will contain
`crates/baresync-core` and `crates/tauri-plugin-baresync`. The Sakti POS app
crate stays in its own repo and is NOT a member of this workspace.

Rationale: The baresync workspace is the target repo for the extracted plugin.
It is independent from the Sakti monorepo. Including the Sakti app crate would
couple the two repos and make workspace-level `cargo test` depend on the full
app build.

Alternative considered: No root workspace, standalone crates. Rejected because
the PRD explicitly calls for a root workspace and it enables
`cargo test --workspace` as the Wave 1 gate.

### D2: Subpath exports mirror the PRD layout exactly

```
"."           → src/index.ts
"./schema"    → src/schema/index.ts
"./generator" → src/generator/index.ts
"./db"        → src/db/index.ts
"./server"    → src/server/index.ts
"./tauri"     → src/tauri/index.ts
"./limits"    → src/limits.ts
```

Each export points to a stub file that re-exports nothing yet. The package
`bin` field points to `./src/cli.ts`.

Rationale: Establishing import paths now prevents path renames during Wave 2.
Consumers (and the generator) can already `import { ... } from "baresync/limits"`
even though no real behavior exists.

### D3: Rust crate dependency versions match Sakti source

`baresync-core` depends on the same `sqlx`, `reqwest`, `serde`, `serde_json`,
and `prost` versions used in the Sakti POS app. `tauri-plugin-baresync` depends
on `tauri` 2 and `baresync-core`.

Rationale: Wave 2 will extract code that uses these exact versions. Matching
now avoids version mismatch compilation errors during extraction.

### D4: Empty stub modules for future extraction targets

Rust core crate gets `db.rs`, `drizzle_proxy.rs`, `migrations.rs` as empty
`pub mod` declarations. JS package gets `db/index.ts`, `schema/index.ts`,
`generator/index.ts`, `server/index.ts`, `tauri/index.ts` as empty exports.

Rationale: Later phases can `use crate::db;` and `import {} from "baresync/db"`
without touching workspace configuration. Stable import paths reduce merge
conflict risk across parallel Wave 2 streams.

### D5: Internal workspace alias `@repo/baresync`

Until publish metadata is ready, the package uses `"name": "@repo/baresync"` in
`package.json`. Public docs and examples should use `baresync`, but internal
imports within the monorepo use the `@repo/` alias.

Rationale: Matches the Sakti pattern (`@repo/sync-proto-generator`,
`@repo/database`). The alias can be changed to the final public name during
Phase 18 without touching import sites if Bun workspace resolution handles it.

## Risks / Trade-offs

**Registry name collision** → Re-check immediately before creating files. The
PRD was written May 19, 2026 with available names. Names may have been claimed
since. If any name is taken, update all references to the fallback before
proceeding.

**Stubs become stale** → Empty modules with no tests could silently break. The
Wave 1 gate only checks compilation and lint. Mitigation: Wave 2 streams will
fill these stubs immediately, limiting the stale window.

**Dependency version drift between baresync and Sakti source** → If the Sakti
monorepo upgrades `sqlx` or `tauri` after the source snapshot was taken, the
baresync crate versions may diverge. Mitigation: Wave 2 extraction references
the frozen source in `docs/external/sakti-pos/`, not a live dependency.
