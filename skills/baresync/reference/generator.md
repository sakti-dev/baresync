# Generator

How the sync contract generator works, its config, CLI, and output.

## How to run

```bash
bun run generate:sync
# or directly
bunx baresync generate
```

## What it does

1. Loads `sync.config.ts`
2. Validates each table against paired schemas (columns match, scope exists, PK correct)
3. Computes table order by following foreign keys (topological sort)
4. Runs diagnostics — errors block, warnings print
5. Writes three output files to `outputDir`

## sync.config.ts

Full `defineSyncConfig` parameters:

```ts
import { defineSyncConfig } from "baresync/generator";
import * as apiSyncedSchema from "./src/api-synced-schema";
import * as localSyncedSchema from "./src/local-synced-schema";

export const syncGeneratorConfig = defineSyncConfig({
  apiSyncedSchema,
  localSyncedSchema,
  outputDir: "./generated",
  tables: {
    locations: { scopeColumn: "scope_id" },
    items: { scopeColumn: "scope_id" },
  },
  limits: {
    maxPushBytes: 2 * 1024 * 1024,  // optional, override defaults
    maxPushRows: 2000,               // optional, override defaults
  },
});
```

| Parameter | Type | Purpose |
|---|---|---|
| `localSyncedSchema` | `* as schema` | Namespace import of local synced tables |
| `apiSyncedSchema` | `* as schema` | Namespace import of API synced tables |
| `outputDir` | `string` | Where to write generated files |
| `tables` | `Record<string, TableOptions>` | Map of export names to sync options |
| `limits` | `{ maxPushBytes?, maxPushRows? }` | Optional. Override default push limits |
| `schemaSourceDir` | `string` | Optional. Override schema source directory for diagnostics |

### Table options

| Option | Default | Purpose |
|---|---|---|
| `scopeColumn` | (required) | Which column partitions data by scope |
| `localOnlyColumns` | `["isSynced"]` | Columns that exist only on local schema |
| `serverOnlyColumns` | `["syncUpdatedAt"]` | Columns that exist only on API schema |

The generator validates that local-only columns are not in the API schema and vice versa.

## CLI flags

### baresync generate

| Flag | Purpose |
|---|---|
| `--config <path>` | Path to a specific config file |
| `--output <dir>` | Override the output directory |
| `--check` | Only validate, do not write files |
| `--warnings-as-errors` | Treat warnings as errors (useful in CI) |

Examples:

```bash
bunx baresync generate                                    # auto-detect config
bunx baresync generate --config packages/sync-contract/sync.config.ts
bunx baresync generate --check                            # validate only
bunx baresync generate --warnings-as-errors               # CI mode
```

### baresync doctor

Runs diagnostics without generating. Same validation as `generate` but no file writes.

```bash
bunx baresync doctor
bunx baresync doctor --config packages/sync-contract/sync.config.ts
```

## Generated files

### sync-contract.json

Full contract — table names, column names, scope mappings, upsert/delete order, limits, local-only and server-only column lists.

```json
{
  "version": "2026-06-03",
  "generatorVersion": "0.1.0",
  "upsertOrder": ["locations", "items"],
  "deleteOrder": ["items", "locations"],
  "tables": {
    "locations": {
      "columns": ["id", "scope_id", "name", "deleted_at", "is_synced", "created_at", "updated_at"],
      "scope": { "field": "scopeId" },
      "localOnlyColumns": ["isSynced"],
      "serverOnlyColumns": ["syncUpdatedAt"]
    }
  },
  "limits": { "maxPushBytes": 2097152, "maxPushRows": 2000 }
}
```

Embedded in the Tauri plugin at compile time via `include_str!`.

### sync-table-order.ts

TypeScript constants for table ordering:

```ts
export const SYNC_UPSERT_ORDER = ["locations", "items"] as const;
export const SYNC_DELETE_ORDER = ["items", "locations"] as const;
```

Used by the server's `createSyncPushHandler` and the Rust plugin's `contract_tables()`.

### sync-contract.manifest.json

Flat manifest for build tooling and CI. Detects contract drift between builds. Used by `bunx baresync doctor` to compare current state against what would be generated.

```json
{
  "contractVersion": "2026-06-03",
  "generatorVersion": "0.1.0",
  "tables": [
    {
      "name": "items",
      "fields": ["id", "name", "scope_id", "deleted_at", "created_at", "updated_at"],
      "fieldNumbers": { "id": 1, "name": 2, "scope_id": 3 }
    }
  ],
  "scopeMappings": [{ "field": "scopeId", "table": "items" }],
  "tableOrder": {
    "upsert": ["locations", "items"],
    "delete": ["items", "locations"]
  }
}
```

Run `bunx baresync doctor` to validate your schemas — runs the same diagnostics as `generate` without writing files.

## Package exports

Wire these in your sync contract `package.json`:

```json
{
  "exports": {
    "./generated/sync-table-order": "./generated/sync-table-order.ts",
    "./generated/sync-contract": "./generated/sync-contract.json",
    "./generated/manifest": "./generated/sync-contract.manifest.json"
  }
}
```

## Programmatic diagnostics

```ts
import { runDiagnostics } from "baresync/generator";

const diagnostics = runDiagnostics(contract);
const errors = diagnostics.filter((d) => d.severity === "error");
```

Each diagnostic has: `code`, `severity`, `message`, `table?`, `column?`, `why`, `fix`.

## Package scripts

Typical setup in your sync contract package:

```json
{
  "scripts": {
    "generate": "bunx baresync generate",
    "doctor": "bunx baresync doctor",
    "check": "bun run doctor && bun run typecheck"
  }
}
```
