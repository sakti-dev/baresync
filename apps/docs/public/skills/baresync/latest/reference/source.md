# Source Code

Use this when references are incomplete, stale, conflicting, or when the user asks about exact implementation behavior.

## Source Policy (MANDATORY)

Workspace source is the default source of truth.

For this repository, the source of truth is the checked-out workspace:

- `packages/baresync/src/` for TypeScript runtime and generator behavior
- `crates/` for Rust plugin and sync engine behavior
- `apps/docs/content/docs/` for user-facing documentation
- `apps/docs/public/skills/baresync/<version>/reference/` for hosted versioned skill references

## Installed Source Rule (MANDATORY)

Do not inspect `node_modules/baresync` when this workspace contains Baresync source.

Use installed package source only when:

- The user is debugging a different project that depends on a published Baresync version.
- The workspace source is not available.
- The user explicitly asks about the installed package copy.

If you need implementation details in this repository, read `packages/baresync/src/` or `crates/`.

## When to use this

- All other references have been consulted and the issue is still unresolved
- The error references a Rust function, trait, or type not documented in other references
- The agent needs to understand how baresync internals actually work
- The integration issue requires reading the actual TypeScript or Rust implementation

Do NOT use this for:
- Setup questions → load `reference/setup.md`
- Schema questions → load `reference/schema.md`
- Server questions → load `reference/server.md`
- General debugging → load `reference/debug.md`
- Any question that other references already answer

## Step 1: Navigate the workspace source

Read the checked-out source directly from the repository before anything else.

The baresync repository is a monorepo. Use this map to find what you need.

### TypeScript runtime (npm package source)

Path: `packages/baresync/src/`

| Directory | Contains |
|-----------|----------|
| `packages/baresync/src/tauri/client.ts` | `createSyncClient`, `writeTransaction`, `writeLocalChange` — client-side sync logic |
| `packages/baresync/src/server/` | `createSyncServer`, low-level primitives, `createDrizzleSyncRepository` — server route helpers |
| `packages/baresync/src/generator/` | `defineSyncConfig`, `generateSyncArtifacts`, diagnostics — sync config and code generation |
| `packages/baresync/src/schema/` | `defineSyncContract`, `defineSyncedTable`, `apiSyncColumns`, `localSyncColumns` — schema helpers |
| `packages/baresync/src/tauri/` | `createTauriDrizzleDatabase`, Drizzle proxy — Tauri database bridge |
| `packages/baresync/src/skills/` | Skill install logic (harness detection, file copy) |

### Rust crates (plugin and sync engine)

Path: `crates/`

| Directory | Contains |
|-----------|----------|
| `crates/baresync-core/src/` | Sync engine — outbox processing, chunking, idempotency, transport traits, pull/push logic |
| `crates/tauri-plugin-baresync/src/` | Tauri plugin — polling loop, IPC commands, migration runner, DB worker, plugin builder |

### Common lookups

- "What does `createSyncClient` accept?" → `packages/baresync/src/tauri/client.ts`
- "How does the plugin poll?" → `crates/tauri-plugin-baresync/src/polling.rs`
- "What does `createDrizzleSyncRepository` return?" → `packages/baresync/src/server/drizzle.ts`
- "How does chunking work?" → `crates/baresync-core/src/chunking.rs`
- "What Tauri commands does the plugin register?" → `crates/tauri-plugin-baresync/src/commands.rs`
- "How does the outbox work?" → `crates/baresync-core/src/outbox.rs`
- "What does the generator output?" → `packages/baresync/src/generator/`
- "How does `writeTransaction` work?" → `packages/baresync/src/tauri/client.ts`
- "What are the sync transport traits?" → `crates/baresync-core/src/transport.rs`
- "How does the migration runner work?" → `crates/tauri-plugin-baresync/src/migrations.rs`
- "How does `setHeaders` work on the JS client?" → `packages/baresync/src/tauri/client.ts` using `rg "setHeaders"`
- "How does `set_headers` command work in Rust?" → `crates/tauri-plugin-baresync/src/commands.rs` using `rg "set_headers"`
- "How are headers stored and shared?" → `crates/tauri-plugin-baresync/src/commands.rs` (look for `PluginState`)
- "How does the transport snapshot headers?" → `crates/baresync-core/src/transport.rs` using `rg "headers"` or `rg "snapshot"`

## Specific API Lookup

| Question | Read |
|---|---|
| `localSyncColumns()` return shape | `packages/baresync/src/schema/` using `rg "localSyncColumns"` |
| `apiSyncColumns()` return shape | `packages/baresync/src/schema/` using `rg "apiSyncColumns"` |
| `defineSyncConfig()` behavior | `packages/baresync/src/generator/config.ts` |
| `generateSyncArtifacts()` behavior | `packages/baresync/src/generator/index.ts` |
| schema-module loading / export filtering | `packages/baresync/src/generator/index.ts` |
| CLI generator behavior | `packages/baresync/src/cli/generator.ts` |
| `writeTransaction()` behavior | `packages/baresync/src/tauri/client.ts` using `rg "writeTransaction"` |
| `writeLocalChange()` behavior | `packages/baresync/src/tauri/client.ts` using `rg "writeLocalChange"` |
| server push handler | `packages/baresync/src/server/` using `rg "createSyncServer"` or the low-level primitives |
| server pull handler | `packages/baresync/src/server/` using `rg "createSyncServer"` or the low-level primitives |
| Drizzle repository | `packages/baresync/src/server/` using `rg "createDrizzleSyncRepository"` |
| Tauri DB bridge | `packages/baresync/src/tauri/` using `rg "createTauriDrizzleDatabase"` |
| `setHeaders()` JS client method | `packages/baresync/src/tauri/client.ts` using `rg "setHeaders"` |
| `set_headers` Rust command | `crates/tauri-plugin-baresync/src/commands.rs` using `rg "set_headers"` |
| `set_headers_with_state` host-callable | `crates/tauri-plugin-baresync/src/commands.rs` using `rg "set_headers_with_state"` |
| Header store (shared `Arc<RwLock<HashMap>>`) | `crates/tauri-plugin-baresync/src/` using `rg "custom_headers"` |
| Builder `.headers()` method | `crates/tauri-plugin-baresync/src/builder.rs` using `rg "fn headers"` |
| Header validation logic | `crates/baresync-core/src/` or `crates/tauri-plugin-baresync/src/` using `rg "Content-Type"` |
| Rust polling loop | `crates/tauri-plugin-baresync/src/polling.rs` |
| Rust commands | `crates/tauri-plugin-baresync/src/commands.rs` |
| Rust chunking | `crates/baresync-core/src/chunking.rs` |
| Rust transport | `crates/baresync-core/src/transport.rs` |

## Stale Skill Protocol

If skill references and workspace source disagree:

1. Trust workspace source.
2. State the mismatch briefly.
3. Answer from source.
4. If the user is modifying the skill/docs, update the stale reference.

Do not hide the mismatch.

## Step 2: Use installed-package source only when necessary

If you are explicitly debugging a published installed copy of baresync in another project, or the workspace source is unavailable, then determine the installed version and fetch the matching source.

### Linux / macOS

Run these commands in order, stopping at the first one that returns a version:

```bash
cat node_modules/baresync/package.json 2>/dev/null | grep '"version"'
```

If that fails (monorepo with hoisted deps):

```bash
grep '"version"' $(find . -path '*/node_modules/baresync/package.json' -maxdepth 5 2>/dev/null | head -1) 2>/dev/null
```

If that fails:

```bash
grep '"baresync"' package.json
```

### Windows (PowerShell / cmd)

Run these commands in order, stopping at the first one that returns a version:

```bash
node -e "try{console.log(require('./node_modules/baresync/package.json').version)}catch{}"
```

If that fails (monorepo with hoisted deps):

```bash
node -e "const p=require('path');let d=process.cwd();while(d!==p.dirname(d)){try{console.log(JSON.parse(require('fs').readFileSync(p.join(d,'node_modules','baresync','package.json'),'utf8')).version);break}catch{}d=p.dirname(d)}"
```

If that fails:

```bash
node -e "const p=require('./package.json');const v=(p.dependencies||{})['baresync']||(p.devDependencies||{})['baresync'];if(v&&!v.includes(':'))console.log(v.replace(/[^0-9.]/g,''))"
```

### All platforms

The version will look like `0.2.0`. If no version can be determined, use `main` as the fallback (see Step 3, Option B).

## Step 3: Fetch the source code

Two options. Try Option A first. If it fails, use Option B.

### Option A: npx opensrc (one command, preferred)

```bash
npx opensrc path baresync@<VERSION>
```

Replace `<VERSION>` with the version from Step 2. Example: `npx opensrc path baresync@0.2.5`

This prints an absolute path to the cached source. The source is cached at `~/.opensrc/` for future use. Works on Linux, macOS, and Windows.

If this fails (e.g. postinstall script blocked, unsupported platform, network error), use Option B.

### Option B: git clone (always works)

Clone the repository at the exact version tag into the project directory:

```bash
git clone --branch v<VERSION> --depth 1 https://github.com/sakti-dev/baresync.git ./baresync-source
```

Replace `<VERSION>` with the version from Step 2. Example: `git clone --branch v0.2.5 --depth 1 https://github.com/sakti-dev/baresync.git ./baresync-source`

If the `v<VERSION>` tag does not exist, try without the `v` prefix:

```bash
git clone --branch <VERSION> --depth 1 https://github.com/sakti-dev/baresync.git ./baresync-source
```

If no version was detected in Step 2, clone the default branch:

```bash
git clone --depth 1 https://github.com/sakti-dev/baresync.git ./baresync-source
```

The source code is at `./baresync-source` relative to the project root.

## Step 4: Clean up

If the source was cloned to `./baresync-source`, the agent should NOT delete it during the session — the user may need to reference it again. Add `baresync-source/` to `.gitignore` if it is not already ignored.

If `npx opensrc` was used, the source is cached at `~/.opensrc/` and will persist.
