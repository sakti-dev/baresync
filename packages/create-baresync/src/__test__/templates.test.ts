import { describe, expect, it } from "vitest";
import {
  buildRootScaffoldFiles,
  buildUserFacingNextSteps,
} from "../templates.js";

describe("buildRootScaffoldFiles", () => {
  it("creates a todo sync contract with lists and todos", () => {
    const files = buildRootScaffoldFiles({
      packageManager: "bun",
      projectName: "acme-inventory",
      serverFramework: "hono",
    });

    const fileMap = new Map(files.map((file) => [file.path, file.content]));

    expect(
      fileMap.get("packages/sync-contract/src/local-synced-schema.ts")
    ).toContain('sqliteTable("lists"');
    expect(
      fileMap.get("packages/sync-contract/src/local-synced-schema.ts")
    ).toContain('sqliteTable("todos"');
    expect(
      fileMap.get("packages/sync-contract/src/local-synced-schema.ts")
    ).toContain("references(() => lists.id");
    expect(fileMap.get("packages/sync-contract/sync.config.ts")).toContain(
      'lists: { scopeColumn: "scope_id" }'
    );
    expect(fileMap.get("packages/sync-contract/sync.config.ts")).toContain(
      'todos: { scopeColumn: "scope_id" }'
    );
    expect(fileMap.get("packages/sync-contract/sync.config.ts")).toContain(
      "defineSyncConfig"
    );
    expect(fileMap.get("apps/app/src-tauri/Cargo.toml")).toContain(
      'name = "acme-inventory-app"'
    );
    expect(fileMap.get("apps/server/package.json")).toContain(
      '"hono": "^4.12.23"'
    );
    expect(fileMap.get("apps/server/package.json")).toContain(
      '"drizzle-orm": "^0.45.2"'
    );
    expect(fileMap.get("apps/server/package.json")).toContain(
      '"better-sqlite3": "^12.10.0"'
    );
    expect(fileMap.get("apps/server/package.json")).toContain(
      '"@types/node": "^25.9.1"'
    );
    expect(fileMap.get("apps/server/package.json")).toContain(
      '"@types/better-sqlite3": "^7.6.13"'
    );

    const biomeConfig = fileMap.get("biome.jsonc");
    expect(biomeConfig).toContain('extends": ["ultracite/biome/core"]');
    expect(biomeConfig).toContain('"noNamespaceImport": "off"');

    const packageJson = fileMap.get("packages/sync-contract/package.json");
    expect(packageJson).toContain('"./api-schema": "./src/api-schema.ts"');
    expect(packageJson).toContain(
      '"./api-synced-schema": "./src/api-synced-schema.ts"'
    );
    expect(packageJson).toContain('"./local-schema": "./src/local-schema.ts"');
    expect(packageJson).toContain(
      '"./local-synced-schema": "./src/local-synced-schema.ts"'
    );
    expect(packageJson).toContain('"./generated/*": "./generated/*"');
    expect(packageJson).not.toContain('"./sync.config"');
  });

  it("includes generated workspace scripts for sync and migration tasks", () => {
    const files = buildRootScaffoldFiles({
      packageManager: "pnpm",
      projectName: "acme-inventory",
      serverFramework: "elysia",
    });

    const rootPackage = files.find((file) => file.path === "package.json");
    expect(rootPackage?.content).toContain("generate:sync");
    expect(rootPackage?.content).toContain("migrate:local");
    expect(rootPackage?.content).toContain("migrate:server");
    expect(rootPackage?.content).toContain("dev");
    expect(rootPackage?.content).toContain('"check": "ultracite check"');
    expect(rootPackage?.content).toContain('"fix": "ultracite fix"');
    expect(rootPackage?.content).toContain('"@biomejs/biome": "2.4.12"');
    expect(rootPackage?.content).toContain('"ultracite": "7.6.2"');

    const serverPackage = files.find(
      (file) => file.path === "apps/server/package.json"
    );
    expect(serverPackage?.content).toContain('"elysia": "^1.4.28"');
    expect(serverPackage?.content).toContain('"drizzle-orm": "^0.45.2"');
    expect(serverPackage?.content).toContain('"better-sqlite3": "^12.10.0"');
    expect(serverPackage?.content).toContain('"@types/node": "^25.9.1"');
    expect(serverPackage?.content).toContain(
      '"@types/better-sqlite3": "^7.6.13"'
    );
  });
});

describe("buildUserFacingNextSteps", () => {
  it("prints commands for generation and dev", () => {
    const text = buildUserFacingNextSteps({
      packageManager: "npm",
      projectName: "acme-inventory",
      serverFramework: "hono",
    });

    expect(text).toContain("npm run generate:sync");
    expect(text).toContain("npm run migrate:local");
    expect(text).toContain("npm run migrate:server");
    expect(text).toContain("npm run dev");
    expect(text).toContain("auth headers");
  });
});
