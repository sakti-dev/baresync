# Flatten create-baresync Template Assets

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move ALL template content into `src/templates/` as raw files with `__PLACEHOLDER__` markers, and make `src/templates.ts` a self-contained reader/generator that reads those files at runtime.

**Architecture:** `src/templates/` holds only raw template files (Cargo.toml, package.json, *.ts, *.mjs). `src/templates.ts` contains `readTemplateAsset()` inline and all generator functions that read + `.replaceAll()`. No intermediate code modules. The build step copies `src/templates/` → `dist/templates/` so the published CLI can read the same files.

**Tech Stack:** Bun, TypeScript, Vitest, Biome/Ultracite, Node `fs`, `path`, `url`.

---

### Task 1: Rename `src/templates/` to `src/template-gen/`

Move the existing code directory out of the way so we can reuse the `src/templates/` path for raw files. This preserves the code as a reference while we extract content.

**Files:**
- Rename: `src/templates/` → `src/template-gen/`

**Step 1: Rename the directory**

```bash
mv packages/create-baresync/src/templates packages/create-baresync/src/template-gen
```

**Step 2: Update the two imports in `src/templates.ts`**

The file imports from `./templates/runtime.js`, `./templates/root.js`, `./templates/sync-contract.js`. Change these to `./template-gen/runtime.js`, `./template-gen/root.js`, `./template-gen/sync-contract.js`.

**Step 3: Run the tests**

Run: `bun x vitest run packages/create-baresync/src/__test__/`

Expected: all 14 tests still pass (the rename is transparent).

**Step 4: Commit**

```bash
git add packages/create-baresync/src/template-gen packages/create-baresync/src/templates.ts
git commit -m "refactor: rename src/templates to src/template-gen for extraction"
```

---

### Task 2: Move raw template files from top-level `templates/` into `src/templates/`

Move the existing raw files we already have into their final home.

**Files:**
- Move: `templates/` → `src/templates/`
- Delete: top-level `templates/`

**Step 1: Create the target and copy**

```bash
mkdir -p packages/create-baresync/src/templates
cp -r packages/create-baresync/templates/* packages/create-baresync/src/templates/
```

**Step 2: Verify the new `src/templates/` has all raw files**

```
src/templates/
  app/
    package.json, db-helper.ts, sync-client.ts, drizzle-local-config.ts
    src/lib.rs
    src-tauri/Cargo.toml, build.rs, tauri.conf.json
  server/
    package.json, drizzle-config.ts, fallback-instructions.md
  sync-contract/
    package.json, tsconfig.json
```

**Step 3: Run existing tests**

Run: `bun x vitest run packages/create-baresync/src/__test__/`

Expected: still pass (we haven't changed any code paths yet).

---

### Task 3: Extract sync-contract inline strings to template files

Create 8 new raw template files from the inline strings in `src/template-gen/sync-contract.ts`.

**Files to create in `src/templates/sync-contract/`:**
- `src/constants.ts`
- `src/local-schema.ts`
- `src/api-schema.ts`
- `src/local-synced-schema.ts`
- `src/api-synced-schema.ts`
- `src/index.ts`
- `sync.config.ts`
- `generate.ts`

**Step 1: Create `src/templates/sync-contract/src/constants.ts`**

Content — same as the return value of `syncContractConstants()` in `src/template-gen/sync-contract.ts:12-18`, with `__PROJECT_NAME__` replacing the `${options.projectName}` interpolation:

```ts
export const PROJECT_NAME = "__PROJECT_NAME__";
export const SYNC_CONTRACT_PACKAGE_NAME = "@baresync/sync-contract";
export const DEFAULT_SCOPE_ID = "default";
export const LISTS_TABLE_NAME = "lists";
export const TODOS_TABLE_NAME = "todos";
```

**Step 2: Create the remaining 7 static files**

Each file's content is the exact return value of the corresponding function in `src/template-gen/sync-contract.ts`. No placeholders needed — they are fully static:

- `src/local-schema.ts` ← `syncContractLocalSchema()` (line 21-26)
- `src/api-schema.ts` ← `syncContractApiSchema()` (line 29-33)
- `src/local-synced-schema.ts` ← `syncContractLocalSyncedSchema()` (line 36-59)
- `src/api-synced-schema.ts` ← `syncContractApiSyncedSchema()` (line 62-84)
- `src/index.ts` ← `syncContractIndex()` (line 116-123)
- `sync.config.ts` ← `syncContractConfig()` (line 86-103)
- `generate.ts` ← `syncContractGenerateScript()` (line 105-114)

**Step 3: Verify no file was missed**

```bash
ls -R packages/create-baresync/src/templates/sync-contract/
```

Expected:
```
src/:
  api-schema.ts
  api-synced-schema.ts
  constants.ts
  index.ts
  local-schema.ts
  local-synced-schema.ts

generate.ts
package.json
sync.config.ts
tsconfig.json
```

---

### Task 4: Extract root inline strings to template files

Create 4 new raw template files from the inline strings in `src/template-gen/root.ts`.

**Files to create in `src/templates/root/`:**
- `package.json`
- `README.md`
- `scripts/run-workspace.mjs`
- `scripts/dev.mjs`

**Step 1: Create `src/templates/root/package.json`**

Content — same as `projectRootPackageJson()` in `src/template-gen/root.ts:86-105`, with `__PROJECT_NAME__` replacing `${options.projectName}`:

```json
{
  "name": "__PROJECT_NAME__",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "node ./scripts/dev.mjs",
    "generate:sync": "node ./scripts/run-workspace.mjs packages/sync-contract generate",
    "migrate:local": "node ./scripts/run-workspace.mjs apps/app db:generate:local",
    "migrate:server": "node ./scripts/run-workspace.mjs apps/server db:generate"
  }
}
```

**Step 2: Create `src/templates/root/README.md`**

Content — same as `projectReadme()` in `src/template-gen/root.ts:107-120`, with `__PROJECT_NAME__` and `__PACKAGE_MANAGER__` replacing the interpolated values:

```md
# __PROJECT_NAME__

Generated with `create-baresync`.

## Commands

- `__PACKAGE_MANAGER__ run install`
- `__PACKAGE_MANAGER__ run generate:sync`
- `__PACKAGE_MANAGER__ run migrate:local`
- `__PACKAGE_MANAGER__ run migrate:server`
- `__PACKAGE_MANAGER__ run dev`
```

**Step 3: Create `src/templates/root/scripts/run-workspace.mjs`**

Content — same as `rootRunWorkspaceScript()` in `src/template-gen/root.ts:7-28`, with `__PACKAGE_MANAGER__` replacing `${JSON.stringify(manager)}`:

```js
import { spawn } from "node:child_process";
import path from "node:path";

const [workspace, script, ...args] = process.argv.slice(2);

if (!workspace || !script) {
  console.error("Usage: node ./scripts/run-workspace.mjs <workspace> <script> [args...]");
  process.exit(1);
}

const child = spawn("__PACKAGE_MANAGER__", ["run", script, ...args], {
  cwd: path.join(process.cwd(), workspace),
  shell: true,
  stdio: "inherit",
});

child.on("close", (code) => {
  process.exit(code ?? 1);
});
```

**Step 4: Create `src/templates/root/scripts/dev.mjs`**

Content — same as `rootDevScript()` in `src/template-gen/root.ts:30-84`, with `__PACKAGE_MANAGER__` replacing `${JSON.stringify(manager)}`:

```js
import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const commands = [
  {
    name: "server",
    cwd: path.join(root, "apps/server"),
    args: ["run", "dev"],
  },
  {
    name: "app",
    cwd: path.join(root, "apps/app"),
    args: ["run", "tauri:dev"],
  },
];

const children = commands.map((command) =>
  spawn("__PACKAGE_MANAGER__", command.args, {
    cwd: command.cwd,
    shell: true,
    stdio: "inherit",
  })
);

let finished = false;

function finish(code) {
  if (finished) return;
  finished = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  process.exit(code);
}

for (const child of children) {
  child.on("close", (code) => {
    if (code && code !== 0) {
      finish(code);
      return;
    }

    if (children.every((item) => item.exitCode !== null || item.signalCode !== null)) {
      finish(0);
    }
  });
}
```

**Step 5: Verify**

```bash
ls -R packages/create-baresync/src/templates/root/
```

Expected:
```
scripts/:
  dev.mjs
  run-workspace.mjs

README.md
package.json
```

---

### Task 5: Extract server inline strings to template files

Create 4 new raw template files from the inline strings in `src/templates.ts` (the `serverSyncRouteModule` and `serverIndexPatch` functions, lines 137-292).

**Files to create in `src/templates/server/src/`:**
- `index-hono.ts`
- `index-elysia.ts`
- `sync-routes.ts`
- `sync-route.ts`

**Step 1: Create `src/templates/server/src/index-hono.ts`**

Content — the hono branch of `serverIndexPatch()` in `src/templates.ts:247-267`:

```ts
import { Hono } from "hono";
import { createBaresyncRoutes } from "./sync-routes";

const app = new Hono();

app.route("/sync", createBaresyncRoutes({
  resolveScope: ({ scopeId }) => ({
    ok: true,
    scope: { scopeId },
  }),
  repository: {
    applyPushChanges: async () => ({ ok: true }),
    loadPullChanges: async () => ({ changedRows: [], deletedIds: [] }),
    loadSyncStatus: async () => ({ changedTables: [], cursor: "" }),
  },
  upsertOrder: ["lists", "todos"],
}));

export default app;
```

**Step 2: Create `src/templates/server/src/index-elysia.ts`**

Content — the elysia branch of `serverIndexPatch()` in `src/templates.ts:270-291`:

```ts
import { Elysia } from "elysia";
import { createBaresyncRoutes } from "./sync-route";

const app = new Elysia();

app.use(
  createBaresyncRoutes({
    resolveScope: ({ scopeId }) => ({
      ok: true,
      scope: { scopeId },
    }),
    repository: {
      applyPushChanges: async () => ({ ok: true }),
      loadPullChanges: async () => ({ changedRows: [], deletedIds: [] }),
      loadSyncStatus: async () => ({ changedTables: [], cursor: "" }),
    },
    upsertOrder: ["lists", "todos"],
  })
);

export default app;
```

**Step 3: Create `src/templates/server/src/sync-routes.ts`**

Content — the hono branch of `serverSyncRouteModule()` in `src/templates.ts:141-191`:

```ts
import { createSyncPullHandler, createSyncPushHandler, createSyncStatusHandler } from "baresync/server";

export function createBaresyncRoutes(deps: {
  resolveScope: (input: { scopeId: string }) => { ok: true; scope: { scopeId: string } } | { ok: false; body: { error: string }; status: number };
  repository: {
    applyPushChanges: (input: { changes: unknown[]; scopeId: string; syncUpdatedAt: number }) => Promise<unknown>;
    loadPullChanges: (input: { cursor: string; scopeId: string; tables: string[] }) => Promise<unknown>;
    loadSyncStatus: (input: { cursor: string; scopeId: string }) => Promise<unknown>;
  };
  upsertOrder: string[];
}) {
  const push = createSyncPushHandler({
    encoding: "json",
    resolveScope: deps.resolveScope,
    upsertOrder: deps.upsertOrder,
    applyPushChanges: async ({ changes, scope, syncUpdatedAt }) =>
      deps.repository.applyPushChanges({
        changes,
        scopeId: scope.scopeId,
        syncUpdatedAt,
      }),
  });

  const pull = createSyncPullHandler({
    encoding: "json",
    resolveScope: deps.resolveScope,
    loadPullChanges: async ({ cursor, scope, tables }) =>
      deps.repository.loadPullChanges({
        cursor,
        scopeId: scope.scopeId,
        tables,
      }),
  });

  const status = createSyncStatusHandler({
    encoding: "json",
    resolveScope: deps.resolveScope,
    loadSyncStatus: async ({ cursor, scope }) =>
      deps.repository.loadSyncStatus({
        cursor,
        scopeId: scope.scopeId,
      }),
  });

  return { pull, push, status };
}
```

**Step 4: Create `src/templates/server/src/sync-route.ts`**

Content — identical to `sync-routes.ts` (the elysia route module has the same content, different filename). Copy `sync-routes.ts` to `sync-route.ts`.

**Step 5: Verify**

```bash
ls packages/create-baresync/src/templates/server/src/
```

Expected: `index-elysia.ts  index-hono.ts  sync-route.ts  sync-routes.ts`

---

### Task 6: Rewrite `src/templates.ts` to read from `src/templates/`

Replace the entire file. Remove all imports from `./template-gen/` and `./templates/`. Inline `readTemplateAsset()` so `src/templates.ts` is self-contained.

**Files:**
- Rewrite: `packages/create-baresync/src/templates.ts`

**Step 1: Write the new `src/templates.ts`**

The new file:
- Inlines `readTemplateAsset()` using `import.meta.url` to resolve `./templates/` relative to itself
- In source mode: `src/templates.ts` → resolves to `src/templates/`
- In built mode: `dist/index.js` → resolves to `dist/templates/`
- Every generator function calls `readTemplateAsset()` + optional `.replaceAll()`
- No imports from `./template-gen/` or `./templates/`

```ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ScaffoldFile } from "./write.js";

export type PackageManager = "bun" | "pnpm" | "npm" | "yarn";
export type ServerFramework = "hono" | "elysia";

export interface ScaffoldOptions {
  packageManager: PackageManager;
  projectName: string;
  serverFramework: ServerFramework;
}

const baseDir = path.dirname(fileURLToPath(import.meta.url));
const templatesRoot = path.join(baseDir, "templates");

function readTemplateAsset(relativePath: string): string {
  return fs.readFileSync(path.join(templatesRoot, relativePath), "utf8");
}

function file(filePath: string, content: string, executable = false): ScaffoldFile {
  return { content, executable, path: filePath };
}

function replaceProjectName(content: string, options: ScaffoldOptions): string {
  return content.replaceAll("__PROJECT_NAME__", options.projectName);
}

function replacePackageManager(content: string, options: ScaffoldOptions): string {
  return content.replaceAll("__PACKAGE_MANAGER__", options.packageManager);
}

function syncContractPackageJson() {
  return readTemplateAsset("sync-contract/package.json");
}

function syncContractTsconfig() {
  return readTemplateAsset("sync-contract/tsconfig.json");
}

function syncContractConstants(options: ScaffoldOptions) {
  return replaceProjectName(readTemplateAsset("sync-contract/src/constants.ts"), options);
}

function syncContractLocalSchema() {
  return readTemplateAsset("sync-contract/src/local-schema.ts");
}

function syncContractApiSchema() {
  return readTemplateAsset("sync-contract/src/api-schema.ts");
}

function syncContractLocalSyncedSchema() {
  return readTemplateAsset("sync-contract/src/local-synced-schema.ts");
}

function syncContractApiSyncedSchema() {
  return readTemplateAsset("sync-contract/src/api-synced-schema.ts");
}

function syncContractConfig() {
  return readTemplateAsset("sync-contract/sync.config.ts");
}

function syncContractGenerateScript() {
  return readTemplateAsset("sync-contract/generate.ts");
}

function syncContractIndex() {
  return readTemplateAsset("sync-contract/src/index.ts");
}

function projectRootPackageJson(options: ScaffoldOptions) {
  return replaceProjectName(readTemplateAsset("root/package.json"), options);
}

function projectReadme(options: ScaffoldOptions) {
  return replacePackageManager(
    replaceProjectName(readTemplateAsset("root/README.md"), options),
    options
  );
}

function projectScripts(options: ScaffoldOptions) {
  const runWorkspace = replacePackageManager(
    readTemplateAsset("root/scripts/run-workspace.mjs"),
    options
  );
  const dev = replacePackageManager(
    readTemplateAsset("root/scripts/dev.mjs"),
    options
  );
  return [
    { content: runWorkspace, executable: true, path: "scripts/run-workspace.mjs" },
    { content: dev, executable: true, path: "scripts/dev.mjs" },
  ];
}

function appPackageJson(options: ScaffoldOptions) {
  return replaceProjectName(readTemplateAsset("app/package.json"), options);
}

function appCargoToml(options: ScaffoldOptions) {
  return replaceProjectName(readTemplateAsset("app/src-tauri/Cargo.toml"), options);
}

function appBuildRs() {
  return readTemplateAsset("app/src-tauri/build.rs");
}

function appTauriConf(options: ScaffoldOptions) {
  return replaceProjectName(readTemplateAsset("app/src-tauri/tauri.conf.json"), options);
}

function appLibRs() {
  return readTemplateAsset("app/src/lib.rs");
}

function appDbHelper() {
  return readTemplateAsset("app/db-helper.ts");
}

function appSyncClient() {
  return readTemplateAsset("app/sync-client.ts");
}

function serverPackageJson(options: ScaffoldOptions) {
  return replaceProjectName(readTemplateAsset("server/package.json"), options);
}

function serverDrizzleConfig(options: ScaffoldOptions) {
  return replaceProjectName(readTemplateAsset("server/drizzle-config.ts"), options);
}

function serverSyncRouteModule(options: ScaffoldOptions) {
  if (options.serverFramework === "hono") {
    return {
      fileName: "sync-routes.ts",
      content: readTemplateAsset("server/src/sync-routes.ts"),
    };
  }
  return {
    fileName: "sync-route.ts",
    content: readTemplateAsset("server/src/sync-route.ts"),
  };
}

function serverIndexPatch(options: ScaffoldOptions) {
  if (options.serverFramework === "hono") {
    return readTemplateAsset("server/src/index-hono.ts");
  }
  return readTemplateAsset("server/src/index-elysia.ts");
}

function serverFallbackInstructions(options: ScaffoldOptions) {
  return readTemplateAsset("server/fallback-instructions.md").replaceAll(
    "__ROUTE_FILE__",
    options.serverFramework === "hono" ? "sync-routes.ts" : "sync-route.ts"
  );
}

function appHelperFiles() {
  return [
    file("apps/app/src/lib/baresync-db.ts", appDbHelper()),
    file("apps/app/src/lib/baresync-sync-client.ts", appSyncClient()),
  ];
}

function appTauriFiles(options: ScaffoldOptions) {
  return [
    file("apps/app/src-tauri/build.rs", appBuildRs()),
    file("apps/app/src-tauri/Cargo.toml", appCargoToml(options)),
    file("apps/app/src-tauri/src/lib.rs", appLibRs()),
    file("apps/app/src-tauri/tauri.conf.json", appTauriConf(options)),
  ];
}

function appDrizzleConfigFile(options: ScaffoldOptions) {
  return replaceProjectName(readTemplateAsset("app/drizzle-local-config.ts"), options);
}

export function buildRootScaffoldFiles(
  options: ScaffoldOptions
): ScaffoldFile[] {
  const serverRoutes = serverSyncRouteModule(options);

  return [
    file("package.json", projectRootPackageJson(options)),
    file("README.md", projectReadme(options)),
    ...projectScripts(options),
    file(
      "packages/sync-contract/package.json",
      syncContractPackageJson()
    ),
    file("packages/sync-contract/tsconfig.json", syncContractTsconfig()),
    file(
      "packages/sync-contract/src/constants.ts",
      syncContractConstants(options)
    ),
    file(
      "packages/sync-contract/src/local-schema.ts",
      syncContractLocalSchema()
    ),
    file("packages/sync-contract/src/api-schema.ts", syncContractApiSchema()),
    file(
      "packages/sync-contract/src/local-synced-schema.ts",
      syncContractLocalSyncedSchema()
    ),
    file(
      "packages/sync-contract/src/api-synced-schema.ts",
      syncContractApiSyncedSchema()
    ),
    file("packages/sync-contract/src/index.ts", syncContractIndex()),
    file("packages/sync-contract/sync.config.ts", syncContractConfig()),
    file("packages/sync-contract/generate.ts", syncContractGenerateScript()),
    ...appTauriFiles(options),
    file("apps/app/package.json", appPackageJson(options)),
    file("apps/app/drizzle.local.config.ts", appDrizzleConfigFile(options)),
    ...appHelperFiles(),
    file("apps/server/package.json", serverPackageJson(options)),
    file("apps/server/drizzle.config.ts", serverDrizzleConfig(options)),
    file(`apps/server/src/${serverRoutes.fileName}`, serverRoutes.content),
    file(
      "apps/server/src/sync-fallback-instructions.md",
      serverFallbackInstructions(options)
    ),
    file("apps/server/src/index.ts", serverIndexPatch(options)),
  ];
}

export function buildUserFacingNextSteps(options: ScaffoldOptions): string {
  return [
    `1. cd ${options.projectName}`,
    `2. ${options.packageManager} install`,
    `3. ${options.packageManager} run generate:sync`,
    `4. ${options.packageManager} run migrate:local`,
    `5. ${options.packageManager} run migrate:server`,
    `6. ${options.packageManager} run dev`,
  ].join("\n");
}
```

**Step 2: Run all existing tests**

Run: `bun x vitest run packages/create-baresync/src/__test__/`

Expected: 14 tests pass. The output of `buildRootScaffoldFiles()` is identical to before — just the source changed from inline strings to file reads.

---

### Task 7: Delete old code and top-level `templates/`

**Files:**
- Delete: `packages/create-baresync/src/template-gen/` (entire directory)
- Delete: `packages/create-baresync/templates/` (top-level, already merged into `src/templates/`)

**Step 1: Delete template-gen**

```bash
rm -rf packages/create-baresync/src/template-gen
```

**Step 2: Delete top-level templates**

```bash
rm -rf packages/create-baresync/templates
```

**Step 3: Run all tests**

Run: `bun x vitest run packages/create-baresync/src/__test__/`

Expected: 14 tests pass. Nothing imports from the deleted directories.

---

### Task 8: Update build script

The build script must copy `src/templates/` → `dist/templates/` so the published CLI can read template files at runtime.

**Files:**
- Modify: `packages/create-baresync/src/build.ts`

**Step 1: Update the copy path**

Change the `fs.cp` call from `path.join("templates")` to `path.join("src", "templates")`:

```ts
await fs.cp(path.join("src", "templates"), path.join("dist", "templates"), {
  recursive: true,
});
```

**Step 2: Rebuild and verify**

```bash
rm -rf packages/create-baresync/dist && bun run --cwd packages/create-baresync build
ls packages/create-baresync/dist/templates/app/package.json
ls packages/create-baresync/dist/templates/sync-contract/src/constants.ts
ls packages/create-baresync/dist/templates/server/src/index-hono.ts
ls packages/create-baresync/dist/templates/root/package.json
```

Expected: all files present.

**Step 3: Run build-output test**

Run: `bun x vitest run packages/create-baresync/src/__test__/build-output.test.ts`

Expected: PASS.

---

### Task 9: Update config and clean up

**Files:**
- Modify: `packages/create-baresync/tsconfig.json`
- Modify: `packages/create-baresync/tsconfig.build.json`
- Modify: `biome.jsonc`
- Modify: `packages/create-baresync/src/__test__/template-modules.test.ts` (update path assertions)

**Step 1: Search for stale references**

```bash
rg -n "src/templates/assets|templates/assets|template-gen" packages/create-baresync biome.jsonc
```

Expected: no matches (we cleaned these up earlier, but double-check).

**Step 2: Update tsconfig excludes**

Both `tsconfig.json` and `tsconfig.build.json` should exclude `src/templates/**` (raw files, not TypeScript source):

In `tsconfig.json`:
```json
"exclude": ["src/**/__test__/**", "src/templates/**"]
```

In `tsconfig.build.json`:
```json
"exclude": ["src/**/__test__/**", "src/templates/**"]
```

**Step 3: Update biome.jsonc**

Add back the exclude for the raw template directory:

```jsonc
"!!packages/create-baresync/src/templates"
```

This replaces the old `"!!packages/create-baresync/src/templates/assets"` line.

**Step 4: Update `template-modules.test.ts`**

The test should verify that `readTemplateAsset` resolves from `src/templates/`, not from a separate code module. Since `readTemplateAsset` is now a private function inside `src/templates.ts`, test it through the public API (`buildRootScaffoldFiles`) or test the file content directly.

The existing tests already test the public API thoroughly. Add a focused test that verifies the new template files exist:

```ts
import { describe, expect, it } from "vitest";
import { buildRootScaffoldFiles } from "../templates.js";

describe("template modules", () => {
  it("reads the app Cargo.toml template from src/templates", () => {
    const files = buildRootScaffoldFiles({
      packageManager: "bun",
      projectName: "test-project",
      serverFramework: "hono",
    });
    const cargoToml = files.find((f) => f.path === "apps/app/src-tauri/Cargo.toml");
    expect(cargoToml?.content).toContain("tauri-plugin-baresync");
  });

  it("reads the sync-contract package.json template from src/templates", () => {
    const files = buildRootScaffoldFiles({
      packageManager: "bun",
      projectName: "test-project",
      serverFramework: "hono",
    });
    const pkg = files.find((f) => f.path === "packages/sync-contract/package.json");
    expect(pkg?.content).toContain('"./generated/sync-contract": "./generated/sync-contract.json"');
  });
});
```

**Step 5: Run all tests**

Run: `bun x vitest run packages/create-baresync/src/__test__/`

Expected: all tests pass.

---

### Task 10: Final verification

**Step 1: Run lint + format**

```bash
bun x ultracite check
bun x ultracite fix  # if needed
```

Expected: clean.

**Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: clean.

**Step 3: Full build**

```bash
rm -rf packages/create-baresync/dist && bun run --cwd packages/create-baresync build
```

Expected: `dist/cli.js`, `dist/index.js`, `dist/templates/...` all present.

**Step 4: Run all tests**

```bash
bun x vitest run packages/create-baresync/src/__test__/
```

Expected: all tests pass.

**Step 5: Verify directory structure is clean**

```bash
ls packages/create-baresync/src/template-gen 2>/dev/null || echo "clean"
ls packages/create-baresync/templates 2>/dev/null || echo "clean"
ls -R packages/create-baresync/src/templates/ | head -40
```

Expected: `template-gen` and top-level `templates` are gone. `src/templates/` has only raw files.

**Step 6: Commit**

```bash
git add packages/create-baresync
git commit -m "feat: flatten create-baresync template assets into src/templates/"
```
