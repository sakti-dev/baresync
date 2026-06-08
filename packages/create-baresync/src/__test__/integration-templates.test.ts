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
    expect(routes?.content).toContain("createSyncServer");
    expect(routes?.content).toContain("db,");
    expect(routes?.content).toContain("push:");
    expect(routes?.content).toContain("pull:");
    expect(routes?.content).toContain("status:");
    expect(routes?.content).toContain("syncServer.push(c.req.raw");
    expect(routes?.content).not.toContain("createSyncPushHandler");
    expect(routes?.content).not.toContain("createSyncPullHandler");
    expect(routes?.content).not.toContain("createSyncStatusHandler");
    expect(routes?.content).not.toContain("idempotency: { db }");
    expect(routes?.content).not.toContain("new Request(");
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
    expect(routes?.content).toContain("createSyncServer");
    expect(routes?.content).toContain("syncServer.push(request");
    expect(routes?.content).toContain("syncServer.pull(request");
    expect(routes?.content).toContain("syncServer.status(request");
    expect(routes?.content).toContain('parse: "none"');
    expect(routes?.content).not.toContain("createSyncPushHandler");
    expect(routes?.content).not.toContain("createSyncPullHandler");
    expect(routes?.content).not.toContain("createSyncStatusHandler");
    expect(routes?.content).not.toContain("idempotency: { db }");
    expect(routes?.content).not.toContain("new Request(");
    expect(routes?.content).not.toContain("JSON.stringify(c.body)");
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
    expect(syncClient?.content).toContain("setHeaders");
  });

  it("includes auth header guidance in generated templates", () => {
    const files = buildRootScaffoldFiles({
      packageManager: "bun",
      projectName: "acme-inventory",
      serverFramework: "hono",
    });

    const syncClient = files.find(
      (file) => file.path === "apps/app/src/lib/baresync-sync-client.ts"
    );
    const readme = files.find((file) => file.path === "README.md");
    const fallback = files.find(
      (file) => file.path === "apps/server/src/sync-fallback-instructions.md"
    );

    expect(syncClient?.content).toContain("setHeaders");
    expect(syncClient?.content).toContain("Authorization");
    expect(readme?.content).toContain("setHeaders");
    expect(readme?.content).toContain("resolveScope");
    expect(fallback?.content).toContain("resolveScope");
    expect(fallback?.content).toContain("setHeaders");
  });
});
