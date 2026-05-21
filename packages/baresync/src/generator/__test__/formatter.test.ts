import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatGeneratedArtifacts } from "../formatter";

describe("formatGeneratedArtifacts", () => {
  it("formats generated TypeScript and JSON with bundled Prettier when no local formatter is available", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-format-"));
    const tsPath = path.join(tmpDir, "sync-table-order.ts");
    const jsonPath = path.join(tmpDir, "sync-contract.json");
    const untouchedPath = path.join(tmpDir, "app.ts");

    fs.writeFileSync(
      tsPath,
      'export const tables=["products","categories"] as const\n'
    );
    fs.writeFileSync(
      jsonPath,
      '{"encoding":"json","tables":["products","categories"]}'
    );
    fs.writeFileSync(untouchedPath, "export const userCode={bad:true}\n");

    formatGeneratedArtifacts({
      projectDir: tmpDir,
      tsAndJson: [tsPath, jsonPath],
    });

    expect(fs.readFileSync(tsPath, "utf-8")).toBe(
      'export const tables = ["products", "categories"] as const;\n'
    );
    expect(fs.readFileSync(jsonPath, "utf-8")).toBe(
      '{ "encoding": "json", "tables": ["products", "categories"] }\n'
    );
    expect(fs.readFileSync(untouchedPath, "utf-8")).toBe(
      "export const userCode={bad:true}\n"
    );

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("uses local Biome for generated files when Biome config and binary are present", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-format-"));
    const tsPath = path.join(tmpDir, "sync.generated.ts");
    const userPath = path.join(tmpDir, "user.ts");
    const binDir = path.join(tmpDir, "node_modules", ".bin");
    const logPath = path.join(tmpDir, "biome-args.json");
    const biomePath = path.join(
      binDir,
      process.platform === "win32" ? "biome.cmd" : "biome"
    );

    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "biome.json"), "{}");
    fs.writeFileSync(tsPath, "export const generated={ok:true}\n");
    fs.writeFileSync(userPath, "export const userCode={bad:true}\n");
    fs.writeFileSync(
      biomePath,
      [
        "#!/usr/bin/env node",
        "const fs = require('node:fs');",
        `fs.writeFileSync(${JSON.stringify(logPath)}, JSON.stringify(process.argv.slice(2)));`,
        "for (const file of process.argv.slice(6)) {",
        "  fs.appendFileSync(file, '// formatted-by-biome\\n');",
        "}",
      ].join("\n")
    );
    fs.chmodSync(biomePath, 0o755);

    formatGeneratedArtifacts({
      projectDir: tmpDir,
      tsAndJson: [tsPath],
    });

    expect(JSON.parse(fs.readFileSync(logPath, "utf-8"))).toEqual([
      "format",
      "--write",
      "--config-path",
      path.join(tmpDir, "biome.json"),
      tsPath,
    ]);
    expect(fs.readFileSync(tsPath, "utf-8")).toContain("formatted-by-biome");
    expect(fs.readFileSync(userPath, "utf-8")).toBe(
      "export const userCode={bad:true}\n"
    );

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("falls back to Prettier when Biome ignores generated files", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-format-"));
    const tsPath = path.join(tmpDir, "generated", "sync.generated.ts");
    const binDir = path.join(tmpDir, "node_modules", ".bin");
    const logPath = path.join(tmpDir, "biome-args.json");
    const biomePath = path.join(
      binDir,
      process.platform === "win32" ? "biome.cmd" : "biome"
    );

    fs.mkdirSync(binDir, { recursive: true });
    fs.mkdirSync(path.dirname(tsPath), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "biome.json"), "{}");
    fs.writeFileSync(tsPath, "export const generated={ok:true}\n");
    fs.writeFileSync(
      biomePath,
      [
        "#!/usr/bin/env node",
        "const fs = require('node:fs');",
        `fs.writeFileSync(${JSON.stringify(logPath)}, JSON.stringify(process.argv.slice(2)));`,
        "process.stderr.write('No files were processed in the specified paths\\n');",
        "process.exit(1);",
      ].join("\n")
    );
    fs.chmodSync(biomePath, 0o755);

    formatGeneratedArtifacts({
      projectDir: tmpDir,
      tsAndJson: [tsPath],
    });

    expect(JSON.parse(fs.readFileSync(logPath, "utf-8"))).toEqual([
      "format",
      "--write",
      "--config-path",
      path.join(tmpDir, "biome.json"),
      tsPath,
    ]);
    expect(fs.readFileSync(tsPath, "utf-8")).toBe(
      "export const generated = { ok: true };\n"
    );

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
