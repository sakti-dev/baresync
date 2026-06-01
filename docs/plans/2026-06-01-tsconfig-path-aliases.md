# TSConfig Path Aliases for Sync Contract

> **Status: FULLY IMPLEMENTED.** All tasks below have been completed. This plan is kept for historical reference.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace workspace package dependency on sync-contract with TSConfig `paths` aliases, so app and server resolve sync-contract files via path mapping instead of workspace protocol — eliminating workspace setup friction.

**Architecture (final design):**
- `@sync-contract/*` → `packages/sync-contract/src/*`
- `@sync-contract/generated/*` → `packages/sync-contract/generated/*`
- No `baseUrl` needed (deprecated in TS 7.0)
- Vite 8 native `resolve.tsconfigPaths: true` instead of `vite-tsconfig-paths` plugin
- `apiUrl` removed from JS `SyncClientConfig`

**Tech Stack:** TypeScript `paths`, Vite 8 native tsconfig paths resolution, Bun native paths resolution, deep-merge JSON patching in scaffold.

---

### Task 1: Update inventory app tsconfig with paths

**Files:**
- Modify: `examples/inventory-json-polling/apps/app/tsconfig.json`

**Step 1: Add paths to tsconfig**

Add `baseUrl` and `paths` to `compilerOptions`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@sync-contract/*": ["../../packages/sync-contract/*"]
    },
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "jsx": "react-jsx"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.d.ts", "vite.config.ts"]
}
```

**Step 2: Verify typecheck passes**

Run: `bun run typecheck` from repo root
Expected: PASS (imports still use old `@examples/sync-contract` paths, no change yet)

---

### Task 2: Add vite-tsconfig-paths to inventory app

**Files:**
- Modify: `examples/inventory-json-polling/apps/app/vite.config.ts`
- Modify: `examples/inventory-json-polling/apps/app/package.json`

**Step 1: Install vite-tsconfig-paths**

Run: `bun add -D vite-tsconfig-paths` from `examples/inventory-json-polling/apps/app`

**Step 2: Add plugin to vite.config.ts**

```ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tsconfigPaths(), react(), tailwindcss()],
  server: {
    headers: {
      "Cache-Control": "no-store",
    },
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
```

Note: `tsconfigPaths()` must come before other plugins.

---

### Task 3: Update inventory server tsconfig with paths

**Files:**
- Modify: `examples/inventory-json-polling/apps/server/tsconfig.json`

**Step 1: Add paths to tsconfig**

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@sync-contract/*": ["../../packages/sync-contract/*"]
    },
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["bun", "node"]
  },
  "include": ["src/**/*.ts", "src/**/*.d.ts"]
}
```

---

### Task 4: Migrate inventory app imports to @sync-contract

**Files:**
- Modify: `examples/inventory-json-polling/apps/app/src/lib/db.ts`
- Modify: `examples/inventory-json-polling/apps/app/src/components/SeedPanel.tsx`
- Modify: `examples/inventory-json-polling/apps/app/src/hooks/useBaresyncQuery.tsx`

**Step 1: Update db.ts imports**

Replace `@examples/sync-contract/local-schema` → `@sync-contract/local-schema`
Replace `@examples/sync-contract/local-synced-schema` → `@sync-contract/local-synced-schema`

**Step 2: Update SeedPanel.tsx imports**

Replace `@examples/sync-contract/constants` → `@sync-contract/constants`

**Step 3: Update useBaresyncQuery.tsx imports**

Replace `@examples/sync-contract/constants` → `@sync-contract/constants`

**Step 4: Verify typecheck**

Run: `bun run typecheck` from repo root
Expected: PASS

---

### Task 5: Migrate inventory server imports to @sync-contract

**Files:**
- Modify: `examples/inventory-json-polling/apps/server/src/index.ts`
- Modify: `examples/inventory-json-polling/apps/server/src/v1/routes.ts`
- Modify: `examples/inventory-json-polling/apps/server/src/db/v1/drizzle-helper/sync-repository.ts`
- Modify: `examples/inventory-json-polling/apps/server/src/db/v1/primitive/sync-repository.ts`
- Modify: `examples/inventory-json-polling/apps/server/src/db/v1/primitive/utils.ts`
- Modify: `examples/inventory-json-polling/apps/server/src/db/seed.ts`

**Step 1: Replace all `@examples/sync-contract` with `@sync-contract` in these files**

Every import currently using `@examples/sync-contract/...` changes to `@sync-contract/...`. No other changes needed.

**Step 2: Verify typecheck**

Run: `bun run typecheck` from repo root
Expected: PASS

---

### Task 6: Remove workspace dependency from inventory app and server

**Files:**
- Modify: `examples/inventory-json-polling/apps/app/package.json`
- Modify: `examples/inventory-json-polling/apps/server/package.json`

**Step 1: Remove @examples/sync-contract from app/package.json**

Delete the line `"@examples/sync-contract": "workspace:*"` from dependencies.

**Step 2: Remove @examples/sync-contract from server/package.json**

Delete the line `"@examples/sync-contract": "workspace:*"` from dependencies.

**Step 3: Reinstall**

Run: `bun install` from `examples/inventory-json-polling`

**Step 4: Verify typecheck and tests**

Run: `bun run typecheck` from repo root
Run: `bun test packages/baresync packages/create-baresync` from repo root
Expected: All PASS

**Step 5: Commit**

```
feat: use tsconfig path aliases for sync-contract imports
```

---

### Task 7: Add tsconfig patching and vite config scaffolding

**Files:**
- Modify: `packages/create-baresync/src/scaffold.ts` (add patchTsconfig helper, patch vite.config.ts)
- Modify: `packages/create-baresync/src/templates.ts` (no changes needed — paths are added via patching)

The scaffold already patches `package.json` using deep merge. We need the same pattern for tsconfig.json.

**Step 1: Add patchTsconfig helper to scaffold.ts**

Add a function that reads the existing tsconfig.json, deep-merges `compilerOptions.paths` and `compilerOptions.baseUrl`, and writes it back. This reuses the existing `deepMerge` function already in scaffold.ts.

```ts
async function patchTsconfig(
  filePath: string,
  patch: Record<string, unknown>
): Promise<void> {
  const current = await fs.readFile(filePath, "utf8");
  await fs.writeFile(
    filePath,
    mergeJson(current, JSON.stringify(patch)),
    "utf8"
  );
}
```

Note: This works because `mergeJson` + `deepMerge` already handle nested objects correctly — `compilerOptions.paths` will be merged into any existing `compilerOptions`.

**Step 2: Add vite config patching helper**

Add a function that injects `vite-tsconfig-paths` into the existing vite.config.ts:

```ts
async function patchViteConfig(filePath: string): Promise<void> {
  let content = await fs.readFile(filePath, "utf8");
  content = `import tsconfigPaths from "vite-tsconfig-paths";\n${content}`;
  content = content.replace(
    /plugins:\s*\[/,
    'plugins: [tsconfigPaths(), '
  );
  await fs.writeFile(filePath, content, "utf8");
}
```

---

### Task 8: Wire tsconfig + vite patching into scaffold flow

**Files:**
- Modify: `packages/create-baresync/src/scaffold.ts` (patchAppFiles, patchServerFiles)

**Step 1: Add tsconfig + vite patching to patchAppFiles**

At the end of `patchAppFiles`, add:

```ts
await patchTsconfig(path.join(projectDir, "apps/app/tsconfig.json"), {
  compilerOptions: {
    baseUrl: ".",
    paths: {
      "@sync-contract/*": ["../../packages/sync-contract/*"],
    },
  },
});

await patchViteConfig(path.join(projectDir, "apps/app/vite.config.ts"));
```

Also add `"vite-tsconfig-paths"` to devDependencies in the existing `patchPackageJson` call:

```ts
devDependencies: {
  "drizzle-kit": "0.31.4",
  "vite-tsconfig-paths": "^5.1.4",
},
```

**Step 2: Add tsconfig patching to patchServerFiles**

At the end of `patchServerFiles`, add:

```ts
await patchTsconfig(path.join(projectDir, "apps/server/tsconfig.json"), {
  compilerOptions: {
    baseUrl: ".",
    paths: {
      "@sync-contract/*": ["../../packages/sync-contract/*"],
    },
  },
});
```

---

### Task 9: Update scaffold template imports to @sync-contract

**Files:**
- Modify: `packages/create-baresync/src/templates/app/sync-client.ts`
- Modify: `packages/create-baresync/src/templates/server/src/index-hono.ts`
- Modify: `packages/create-baresync/src/templates/server/src/index-elysia.ts`
- Modify: `packages/create-baresync/src/templates/server/src/sync-route.ts`
- Modify: `packages/create-baresync/src/templates/server/src/sync-routes.ts`
- Modify: `packages/create-baresync/src/templates/sync-contract/package.json`
- Modify: `packages/create-baresync/src/templates/sync-contract/sync.config.ts`
- Modify: `packages/create-baresync/src/templates/app/package.json`
- Modify: `packages/create-baresync/src/templates/server/package.json`

**Step 1: Replace all `@baresync/sync-contract` with `@sync-contract` in template files**

Every import and reference to `@baresync/sync-contract/...` becomes `@sync-contract/...`.

**Step 2: Remove sync-contract workspace dependency from template package.jsons**

In `packages/create-baresync/src/templates/app/package.json` — remove any `@baresync/sync-contract` dependency.
In `packages/create-baresync/src/templates/server/package.json` — remove any `@baresync/sync-contract` dependency.

Note: The sync-contract package.json `exports` map stays — it's still needed for `bunx baresync generate` CLI resolution.

**Step 3: Update scaffold tests for new import paths**

Run: `bun test packages/create-baresync`
Fix any test assertions that check for `@baresync/sync-contract` — update to `@sync-contract`.

---

### Task 10: Run full verification

**Step 1: Lint**

Run: `bun x ultracite check`
Expected: 0 errors

**Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 3: All tests**

Run: `bun test packages/baresync packages/create-baresync`
Expected: All PASS

**Step 4: Commit**

```
feat: scaffold emits tsconfig path aliases for sync-contract
```
