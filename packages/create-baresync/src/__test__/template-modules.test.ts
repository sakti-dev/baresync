import { describe, expect, it } from "vitest";
import { buildRootScaffoldFiles } from "../templates.js";

describe("template modules", () => {
  it("reads the app Cargo.toml template from src/templates", () => {
    const files = buildRootScaffoldFiles({
      packageManager: "bun",
      projectName: "test-project",
      serverFramework: "hono",
    });
    const cargoToml = files.find(
      (f) => f.path === "apps/app/src-tauri/Cargo.toml"
    );
    expect(cargoToml?.content).toContain("tauri-plugin-baresync");
  });

  it("reads the sync-contract package.json template from src/templates", () => {
    const files = buildRootScaffoldFiles({
      packageManager: "bun",
      projectName: "test-project",
      serverFramework: "hono",
    });
    const pkg = files.find(
      (f) => f.path === "packages/sync-contract/package.json"
    );
    expect(pkg?.content).toContain(
      '"./generated/sync-contract": "./generated/sync-contract.json"'
    );
  });
});
