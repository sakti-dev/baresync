import { describe, expect, it } from "vitest";
import { buildRootScaffoldFiles } from "../templates.js";

describe("server and tauri scaffold templates", () => {
  it("generates a hono entrypoint that mounts baresync under /sync", () => {
    const files = buildRootScaffoldFiles({
      packageManager: "bun",
      projectName: "acme-inventory",
      serverFramework: "hono",
    });

    const serverIndex = files.find(
      (file) => file.path === "apps/server/src/index.ts"
    );
    const fallback = files.find(
      (file) => file.path === "apps/server/src/sync-fallback-instructions.md"
    );

    expect(serverIndex?.content).toContain('app.route("/api/v1/sync"');
    expect(serverIndex?.content).toContain("createBaresyncRoutes");
    expect(fallback?.content).toContain("Manual mount required");
  });

  it("generates an elysia entrypoint that mounts baresync with app.use", () => {
    const files = buildRootScaffoldFiles({
      packageManager: "bun",
      projectName: "acme-inventory",
      serverFramework: "elysia",
    });

    const serverIndex = files.find(
      (file) => file.path === "apps/server/src/index.ts"
    );
    const routeModule = files.find(
      (file) => file.path === "apps/server/src/sync-route.ts"
    );

    expect(serverIndex?.content).toContain("app.use(");
    expect(serverIndex?.content).toContain("createBaresyncRoutes");
    expect(routeModule?.content).toContain("createBaresyncRoutes");
  });

  it("generates the tauri plugin builder setup and helper modules", () => {
    const files = buildRootScaffoldFiles({
      packageManager: "bun",
      projectName: "acme-inventory",
      serverFramework: "hono",
    });

    const libRs = files.find(
      (file) => file.path === "apps/app/src-tauri/src/lib.rs"
    );
    const dbHelper = files.find(
      (file) => file.path === "apps/app/src/lib/baresync-db.ts"
    );
    const syncClient = files.find(
      (file) => file.path === "apps/app/src/lib/baresync-sync-client.ts"
    );

    expect(libRs?.content).toContain("BaresyncBuilder::new()");
    expect(libRs?.content).toContain('migrations_path("migrations")');
    expect(libRs?.content).toContain("contract_json(include_str!");
    expect(dbHelper?.content).toContain("createTauriDrizzleDatabase");
    expect(syncClient?.content).toContain("createSyncClient");
  });
});
