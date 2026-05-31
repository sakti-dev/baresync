import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pkgRoot = path.resolve(import.meta.dirname, "..", "..");
const distDir = path.join(pkgRoot, "dist");

let didBuild = false;

beforeAll(async () => {
  const cliExists = fs.existsSync(path.join(distDir, "cli.js"));
  if (!cliExists) {
    const { execSync } = await import("node:child_process");
    execSync("bun run build", { cwd: pkgRoot, stdio: "pipe" });
    didBuild = true;
  }
}, 30_000);

afterAll(() => {
  if (didBuild) {
    const distTemplates = path.join(distDir, "templates");
    if (fs.existsSync(distTemplates)) {
      fs.rmSync(distTemplates, { recursive: true });
    }
    for (const entry of fs.readdirSync(distDir)) {
      if (
        entry.endsWith(".js") ||
        entry.endsWith(".map") ||
        entry.endsWith(".d.ts") ||
        entry.endsWith(".d.ts.map")
      ) {
        fs.rmSync(path.join(distDir, entry));
      }
    }
  }
});

describe("build output", () => {
  it("copies template assets into dist/templates", () => {
    const appPkg = path.join(distDir, "templates", "app", "package.json");
    expect(fs.existsSync(appPkg)).toBe(true);
    const content = fs.readFileSync(appPkg, "utf8");
    expect(content).toContain("__PROJECT_NAME__");
  });

  it("includes app Cargo.toml in the dist tree", () => {
    const cargoToml = path.join(
      distDir,
      "templates",
      "app",
      "src-tauri",
      "Cargo.toml"
    );
    expect(fs.existsSync(cargoToml)).toBe(true);
    const content = fs.readFileSync(cargoToml, "utf8");
    expect(content).toContain("tauri-plugin-baresync");
  });

  it("includes sync-contract templates in the dist tree", () => {
    const pkgJson = path.join(
      distDir,
      "templates",
      "sync-contract",
      "package.json"
    );
    expect(fs.existsSync(pkgJson)).toBe(true);
  });

  it("includes server templates in the dist tree", () => {
    const drizzle = path.join(
      distDir,
      "templates",
      "server",
      "drizzle-config.ts"
    );
    expect(fs.existsSync(drizzle)).toBe(true);
  });
});
