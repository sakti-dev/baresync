# Source Code

Last resort when the agent is stuck and no other reference covers the issue.

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

## Step 1: Detect the installed version

The agent MUST determine which version of baresync the user has installed.

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

The version will look like `0.2.0`. If no version can be determined, use `main` as the fallback (see Step 2, Option B).

## Step 2: Fetch the source code

Two options. Try Option A first. If it fails, use Option B.

### Option A: npx opensrc (one command, preferred)

```bash
npx opensrc path baresync@<VERSION>
```

Replace `<VERSION>` with the version from Step 1. Example: `npx opensrc path baresync@0.2.0`

This prints an absolute path to the cached source. The source is cached at `~/.opensrc/` for future use. Works on Linux, macOS, and Windows.

If this fails (e.g. postinstall script blocked, unsupported platform, network error), use Option B.

### Option B: git clone (always works)

Clone the repository at the exact version tag into the project directory:

```bash
git clone --branch v<VERSION> --depth 1 https://github.com/sakti-dev/baresync.git ./baresync-source
```

Replace `<VERSION>` with the version from Step 1. Example: `git clone --branch v0.2.0 --depth 1 https://github.com/sakti-dev/baresync.git ./baresync-source`

If the `v<VERSION>` tag does not exist, try without the `v` prefix:

```bash
git clone --branch <VERSION> --depth 1 https://github.com/sakti-dev/baresync.git ./baresync-source
```

If no version was detected in Step 1, clone the default branch:

```bash
git clone --depth 1 https://github.com/sakti-dev/baresync.git ./baresync-source
```

The source code is at `./baresync-source` relative to the project root.

## Step 3: Navigate the source

The baresync repository is a monorepo. Use this map to find what you need.

### TypeScript runtime (npm package source)

Path: `packages/baresync/src/`

| Directory | Contains |
|-----------|----------|
| `packages/baresync/src/client/` | `createSyncClient`, `writeTransaction`, `writeLocalChange` — client-side sync logic |
| `packages/baresync/src/server/` | `createSyncPushHandler`, `createSyncPullHandler`, `createDrizzleSyncRepository` — server handler factories |
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

- "What does `createSyncClient` accept?" → `packages/baresync/src/client/`
- "How does the plugin poll?" → `crates/tauri-plugin-baresync/src/polling.rs`
- "What does `createDrizzleSyncRepository` return?" → `packages/baresync/src/server/drizzle.ts`
- "How does chunking work?" → `crates/baresync-core/src/chunking.rs`
- "What Tauri commands does the plugin register?" → `crates/tauri-plugin-baresync/src/commands.rs`
- "How does the outbox work?" → `crates/baresync-core/src/outbox.rs`
- "What does the generator output?" → `packages/baresync/src/generator/`
- "How does `writeTransaction` work?" → `packages/baresync/src/client/`
- "What are the sync transport traits?" → `crates/baresync-core/src/transport.rs`
- "How does the migration runner work?" → `crates/tauri-plugin-baresync/src/migrations.rs`

## Step 4: Clean up

If the source was cloned to `./baresync-source`, the agent should NOT delete it during the session — the user may need to reference it again. Add `baresync-source/` to `.gitignore` if it is not already ignored.

If `npx opensrc` was used, the source is cached at `~/.opensrc/` and will persist.
