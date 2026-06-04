import { describe, expect, it } from "vitest";
import { buildRootScaffoldFiles } from "../templates.js";

const CONTRACT_PATH_RE =
  /packages\/sync-contract\/generated\/\d{4}-\d{2}-\d{2}\/sync-contract\.json/;

describe("server and tauri scaffold templates", () => {
  it("generates a hono entrypoint that mounts the sync routes", () => {
    const files = buildRootScaffoldFiles({
      packageManager: "bun",
      projectName: "acme-inventory",
      serverFramework: "hono",
    });

    const serverIndex = files.find(
      (file) => file.path === "apps/server/src/index.ts"
    );
    const routes = files.find(
      (file) => file.path === "apps/server/src/v1/routes.ts"
    );
    const fallback = files.find(
      (file) => file.path === "apps/server/src/sync-fallback-instructions.md"
    );

    expect(serverIndex?.content).toContain('app.route("/api/sync/v1"');
    expect(serverIndex?.content).toContain('import sync from "./v1/routes"');
    expect(routes?.content).toContain("createSyncPushHandler");
    expect(routes?.content).toContain("repository");
    expect(fallback?.content).toContain("Manual mount required");
  });

  it("generates an elysia entrypoint that uses the sync routes module", () => {
    const files = buildRootScaffoldFiles({
      packageManager: "bun",
      projectName: "acme-inventory",
      serverFramework: "elysia",
    });

    const serverIndex = files.find(
      (file) => file.path === "apps/server/src/index.ts"
    );
    const routes = files.find(
      (file) => file.path === "apps/server/src/v1/routes.ts"
    );

    expect(serverIndex?.content).toContain(".use(sync)");
    expect(serverIndex?.content).toContain(
      'import { sync } from "./v1/routes"'
    );
    expect(routes?.content).toContain("createSyncPushHandler");
    expect(routes?.content).toContain("repository");
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
      (file) => file.path === "apps/app/src/lib/db.ts"
    );
    const syncClient = files.find(
      (file) => file.path === "apps/app/src/lib/baresync-sync-client.ts"
    );

    expect(libRs?.content).toContain("BaresyncBuilder::new()");
    expect(libRs?.content).toContain('migrations_path("migrations")');
    expect(libRs?.content).toContain("contract_json(include_str!");
    expect(libRs?.content).toMatch(CONTRACT_PATH_RE);
    expect(dbHelper?.content).toContain("createTauriDrizzleDatabase");
    expect(syncClient?.content).toContain("createSyncClient");
  });
});
